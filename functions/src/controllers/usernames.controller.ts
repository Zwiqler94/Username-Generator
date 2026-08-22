import axios from "axios";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { defaultWords } from "../constants/default-words";
import { ThesaurusResultModelV2 } from "../models/thesaurus.model";
import { badWords } from "../constants/bad-words";
import { info, error } from "firebase-functions/logger";
import {
  MAX_SPECIAL_LENGTH,
  MAX_SPECIALS,
  MAX_WORD_LENGTH,
  MAX_WORDS,
} from "../validators/username-req.validator";

let cachedThesaurusKey: string | null = null;

async function resolveThesaurusKey(): Promise<string> {
  if (cachedThesaurusKey) return cachedThesaurusKey;
  // Try runtime secret (defineSecret)
  try {
    // dynamic import to avoid circular dependency with server/index
    const mod = (await import("../index.js")) as
      | { apiKey?: { value?: () => unknown } }
      | undefined;
    const runtimeApiKey = mod?.apiKey ?? null;
    if (runtimeApiKey && typeof runtimeApiKey.value === "function") {
      const val = runtimeApiKey.value();
      if (val) {
        cachedThesaurusKey = String(val);
        return cachedThesaurusKey;
      }
    }
  } catch {
    // ignore and fall back to env
  }

  // Fallback to environment variable for local development
  if (process.env.MW_THESAURUS_API) {
    cachedThesaurusKey = process.env.MW_THESAURUS_API;
    return cachedThesaurusKey;
  }

  throw new Error("MW_THESAURUS_API not available (set secret or env var)");
}

// Simple in-memory cache for thesaurus responses with TTL and max size.
type CacheEntry = { value: unknown; expiresAt: number };
const THESAURUS_CACHE_MAX = 1000;
const THESAURUS_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_LOOKUPS = 25;
const MAX_RECURSION_DEPTH = 3;
const MAX_RESPONSE_RESULTS = 500;
const MAX_GENERATED_USERNAMES = 500;
const MAX_USERNAME_LENGTH = 50;
const THESAURUS_TIMEOUT_MS = 5000;
const THESAURUS_MAX_RESPONSE_BYTES = 64 * 1024;
const SAFE_THESAURUS_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ETIMEDOUT",
  "ERR_BAD_REQUEST",
  "ERR_BAD_RESPONSE",
  "ERR_CANCELED",
  "ERR_NETWORK",
]);
const thesaurusCache = new Map<string, CacheEntry>();

function getFromThesaurusCache(key: string): unknown | null {
  const entry = thesaurusCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    thesaurusCache.delete(key);
    return null;
  }
  // Refresh insertion order for basic LRU behavior
  thesaurusCache.delete(key);
  thesaurusCache.set(key, entry);
  return entry.value;
}

function setThesaurusCache(key: string, value: unknown) {
  if (thesaurusCache.size >= THESAURUS_CACHE_MAX) {
    // delete oldest
    const oldestKey = thesaurusCache.keys().next().value;
    if (oldestKey) thesaurusCache.delete(oldestKey);
  }
  thesaurusCache.set(key, {
    value,
    expiresAt: Date.now() + THESAURUS_CACHE_TTL_MS,
  });
}

export class UsernameGenerator {
  private _baseThesaurusUrl =
    "https://www.dictionaryapi.com/api/v3/references/thesaurus/json";

  private apiKey = "";
  private static badWordsSet: Set<string> = new Set(
    badWords.map((w) => w.trim().toLowerCase()),
  );

  get baseThesaurusUrl() {
    return this._baseThesaurusUrl;
  }

  generateUsernameHandler = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        throw new Error("Bad Request Body");
      }

      // badWordsSet is now always available

      let usernames: string[] = [];

      this.apiKey = await resolveThesaurusKey();

      const requestedMaxLength = req.query.maxlength
        ? Number(req.query.maxlength)
        : 20;
      if (
        !Number.isInteger(requestedMaxLength) ||
        requestedMaxLength < 1 ||
        requestedMaxLength > MAX_USERNAME_LENGTH
      ) {
        throw new Error("Invalid maxlength");
      }
      const maxLength = requestedMaxLength;
      let responseData: string[] = [];

      let processedWords: string[] = [];

      const words: unknown[] = Array.isArray(req.body.words)
        ? req.body.words.slice(0, MAX_WORDS)
        : [];

      if (words.length > 0) {
        processedWords = Array.from(
          new Set(
            words
              .filter((word): word is string => typeof word === "string")
              .map((word) => word.trim().slice(0, MAX_WORD_LENGTH))
              .filter(Boolean)
              .filter((word) => {
                const normalized = word.toLowerCase();
                return !UsernameGenerator.badWordsSet.has(normalized);
              }),
          ),
        );
      }
      responseData = processedWords.length > 0
        ? await this.getWordsFromResponse(processedWords)
        : await this.getWordsFromResponse(defaultWords);

      usernames = this.generateUsernames(
        responseData,
        this.normalizeSpecialCharacters(req.body.specials),
      );

      res.status(200).json(
        usernames
          .filter((username) => username.length <= maxLength)
          .slice(0, MAX_GENERATED_USERNAMES),
      );
    } catch (err) {
      error(`${err}: ${JSON.stringify(errors)}`);
      res.status(400).json(errors);
      throw err;
    }
  };

  // No need for loadBadWords; badWordsSet is built at module load

  private normalizeSpecialCharacters(specialCharacters: unknown): string[] {
    if (!Array.isArray(specialCharacters)) return [];

    return Array.from(
      new Set(
        specialCharacters
          .filter((specialCharacter): specialCharacter is string => {
            return typeof specialCharacter === "string";
          })
          .map((specialCharacter) => specialCharacter.trim())
          .filter((specialCharacter) => {
            return (
              specialCharacter.length <= MAX_SPECIAL_LENGTH &&
              /^[A-Za-z0-9_.!@#$-]+$/.test(specialCharacter)
            );
          }),
      ),
    ).slice(0, MAX_SPECIALS);
  }

  private async getWordsFromResponse(
    words: string[],
    depth = 0,
    budget = { lookups: 0 },
  ) {
    let responseData: string[] = [];

    if (depth > MAX_RECURSION_DEPTH || budget.lookups >= MAX_LOOKUPS) {
      return responseData;
    }

    for (const word of words) {
      if (
        budget.lookups >= MAX_LOOKUPS ||
        responseData.length >= MAX_RESPONSE_RESULTS
      ) {
        break;
      }
      const formattedWord = word.replace(/([^0-9a-zA-Z]+)/g, "");
      // SSRF mitigation: Only allow non-empty alphanumeric words of reasonable length
      if (
        !/^[a-zA-Z0-9]+$/.test(formattedWord) ||
        formattedWord.length < 2 ||
        formattedWord.length > 30
      ) {
        // Optionally log, skip, or handle invalid words
        continue;
      }
      const cacheKey = `${formattedWord.toLowerCase()}`;
      const cached = getFromThesaurusCache(cacheKey);
      if (cached) {
        const data = cached as unknown;
        if (this.isThesaurusResultModelV2Array(data)) {
          responseData = await this.getWordsToUse(
            data as ThesaurusResultModelV2[],
          );
        } else if (Array.isArray(data) && this.isStringArray(data)) {
          responseData = await this.getWordsFromResponse(
            data,
            depth + 1,
            budget,
          );
        }
        responseData = responseData.slice(0, MAX_RESPONSE_RESULTS);
        continue;
      }

      budget.lookups += 1;
      const mWThesaurus = `${this.baseThesaurusUrl}/${formattedWord}/?key=${this.apiKey}`;
      try {
        const synonyms = await axios.get(mWThesaurus, {
          timeout: THESAURUS_TIMEOUT_MS,
          maxContentLength: THESAURUS_MAX_RESPONSE_BYTES,
          maxBodyLength: THESAURUS_MAX_RESPONSE_BYTES,
        });
        setThesaurusCache(cacheKey, synonyms.data);
        if (this.isThesaurusResultModelV2Array(synonyms.data)) {
          responseData = await this.getWordsToUse(synonyms.data);
        } else if (
          Array.isArray(synonyms.data) &&
          this.isStringArray(synonyms.data)
        ) {
          responseData = await this.getWordsFromResponse(
            synonyms.data,
            depth + 1,
            budget,
          );
        }
        responseData = responseData.slice(0, MAX_RESPONSE_RESULTS);
      } catch (err) {
        const isAxiosError = axios.isAxiosError(err);
        const responseStatus = isAxiosError ? err.response?.status : undefined;
        const status =
          typeof responseStatus === "number" &&
          Number.isInteger(responseStatus) &&
          responseStatus >= 100 &&
          responseStatus <= 599
            ? responseStatus
            : "unknown";
        const code =
          isAxiosError &&
          typeof err.code === "string" &&
          SAFE_THESAURUS_ERROR_CODES.has(err.code)
            ? err.code
            : "UNKNOWN";
        error("thesaurus_request_failed", {
          provider: "merriam-webster",
          status,
          code,
        });
      }
    }
    return responseData;
  }

  isThesaurusResultModelV2 = (
    data: unknown,
  ): data is ThesaurusResultModelV2 => {
    return (
      typeof data === "object" && data !== null && "meta" in (data as object)
    );
  };

  isThesaurusResultModelV2Array = (
    data: unknown,
  ): data is ThesaurusResultModelV2[] => {
    return (
      Array.isArray(data) &&
      (data as unknown[]).every((entry) => this.isThesaurusResultModelV2(entry))
    );
  };

  isStringArray = (arr: unknown[]): arr is string[] => {
    return arr.every((i) => typeof i === "string");
  };

  private async getWordsToUse(data: ThesaurusResultModelV2[]) {
    let resultsInFunction: string[] = [];

    for (const entry of data) {
      if (resultsInFunction.length >= MAX_RESPONSE_RESULTS) break;
      if (this.isThesaurusResultModelV2(entry)) {
        resultsInFunction = resultsInFunction.concat(entry.meta.stems);
        resultsInFunction = resultsInFunction.concat(
          (entry.meta.syns as string[][]).flat(3),
        );
        resultsInFunction = resultsInFunction.slice(0, MAX_RESPONSE_RESULTS);
      }
    }

    return resultsInFunction;
  }

  private generateUsernames(
    responseData: string[],
    specialCharacters?: string[],
  ) {
    info(responseData);
    const usernames: string[] = [];
    for (let i = 1; i < responseData.length; i++) {
      if (usernames.length >= MAX_GENERATED_USERNAMES) break;
      const responseIndexGenerator = () =>
        this.randomResponseDataIndex(i, responseData);
      const responseDefaultIndexGenerator = () => this.randomDefaultIndex();
      const randomNumberGenerator = (arrLength?: number) =>
        this.randomIndex(arrLength);

      for (let attempt = 0; attempt < 15; attempt++) {
        if (usernames.length >= MAX_GENERATED_USERNAMES) break;
        usernames.push(
          this.createUsername(
            responseData,
            responseIndexGenerator,
            responseDefaultIndexGenerator,
            randomNumberGenerator,
            specialCharacters!,
          ).join(""),
        );
      }
    }
    return Array.from(new Set(usernames));
  }

  private createUsername(
    responseData: string[],
    responseIndexGenerator: () => number,
    responseDefaultIndexGenerator: () => number,
    randomNumberGenerator: (arrLength?: number) => number,
    specialCharacters: string[],
  ): string[] {
    return Array.from(
      new Set([
        responseData.length > responseIndexGenerator()
          ? this.capitalizeWord(responseData[responseIndexGenerator()])
          : this.capitalizeWord(defaultWords[responseDefaultIndexGenerator()]),
        specialCharacters !== undefined && specialCharacters.length > 0
          ? specialCharacters[randomNumberGenerator(specialCharacters.length)]
          : "",
        responseIndexGenerator() % 2 === 0
          ? String(responseIndexGenerator())
          : "",
        specialCharacters !== undefined &&
        specialCharacters.length > 0 &&
        responseDefaultIndexGenerator() % 24 === 0
          ? specialCharacters[randomNumberGenerator(specialCharacters.length)]
          : "",
        responseData.length > responseIndexGenerator()
          ? this.capitalizeWord(responseData[responseIndexGenerator()])
          : this.capitalizeWord(defaultWords[responseDefaultIndexGenerator()]),
        specialCharacters !== undefined &&
        specialCharacters.length > 0 &&
        responseIndexGenerator() % 2 === 0
          ? specialCharacters[randomNumberGenerator(specialCharacters.length)]
          : "",
        responseDefaultIndexGenerator() % 7 === 0
          ? String(responseDefaultIndexGenerator())
          : "",
        specialCharacters !== undefined &&
        specialCharacters.length > 0 &&
        responseDefaultIndexGenerator() % 7 === 0
          ? specialCharacters[randomNumberGenerator(specialCharacters.length)]
          : "",
        responseData.length > responseIndexGenerator()
          ? this.capitalizeWord(responseData[responseIndexGenerator()])
          : this.capitalizeWord(defaultWords[responseDefaultIndexGenerator()]),
        randomNumberGenerator() % 31 === 0
          ? String(randomNumberGenerator())
          : "",
        specialCharacters !== undefined &&
        specialCharacters.length > 0 &&
        randomNumberGenerator() % 31 === 0
          ? specialCharacters[randomNumberGenerator(specialCharacters.length)]
          : "",
      ]),
    );
  }

  private randomResponseDataIndex(i: number, responseData: string[]) {
    return Math.floor((Math.random() * (i + 24)) % responseData.length);
  }

  private randomDefaultIndex() {
    return Math.floor(Math.random() * defaultWords.length);
  }

  private randomIndex(arrLength?: number) {
    const length = arrLength ? arrLength : 2938;
    return Math.floor(Math.random() * length);
  }

  private capitalizeWord(word: string): string {
    const trimRegex = /[\s'()-]+/;
    let result: string[] | string = word.trim().split(trimRegex);
    if (typeof result !== "string" && result.length > 1) {
      result = result.map((fragment: string) => {
        if (fragment.length > 1) {
          let fragmentResult = fragment.at(0)!.toUpperCase();
          fragmentResult += fragment.substring(1);
          return fragmentResult;
        } else {
          return this.capitalizeWord(
            defaultWords[Math.floor(Math.random() * defaultWords.length)],
          );
        }
      });
      result = result.join("");
    } else {
      result = word.at(0)!.toUpperCase();
      result += word.substring(1);
    }
    return result;
  }
}
