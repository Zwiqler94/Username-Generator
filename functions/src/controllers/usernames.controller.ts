import axios from "axios";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { defaultWords } from "../constants/default-words";
import { ThesaurusResultModelV2 } from "../models/thesaurus.model";
import { badWords } from "../constants/bad-words";
import { apiKey } from "..";

let cachedThesaurusKey: string | null = null;

async function resolveThesaurusKey(): Promise<string> {
  if (cachedThesaurusKey) return cachedThesaurusKey;
  // Try runtime secret (defineSecret)
  try {
    const val = apiKey.value();
    if (val) {
      cachedThesaurusKey = String(val);
      return cachedThesaurusKey;
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
  thesaurusCache.set(key, { value, expiresAt: Date.now() + THESAURUS_CACHE_TTL_MS });
}

export class UsernameGenerator {
  

  private _baseThesaurusUrl =
    "https://www.dictionaryapi.com/api/v3/references/thesaurus/json";

  private apiKey = "";
  private static badWordsSet: Set<string> = new Set(badWords.map(w => w.trim().toLowerCase()));
  

  

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

      const maxLength = req.query.maxlength ? Number(req.query.maxlength) : 20;
      let responseData: string[] = [];

      let processedWords: string[] = [];

      const words: unknown[] = Array.isArray(req.body.words) ? req.body.words : [];

      if (words.length > 0) {
        processedWords = words
          .map((w) => String(w || "")).filter(Boolean)
          .filter((w) => {
            const normalized = w.trim().toLowerCase();
            return !UsernameGenerator.badWordsSet.has(normalized);
          });
      }
      responseData = processedWords
        ? await this.getWordsFromResponse(processedWords)
        : await this.getWordsFromResponse(defaultWords);

      usernames = this.generateUsernames(responseData, req.body.specials);

      res
        .status(200)
        .send(usernames.filter((username) => username.length <= maxLength));
    } catch (error) {
      console.error(`${error}: ${JSON.stringify(errors)}`);
      res.status(400).json(errors);
      throw error;
    }
  };

  // No need for loadBadWords; badWordsSet is built at module load

  private async getWordsFromResponse(words: string[]) {
    let responseData: string[] = [];

    for (const word of words as string[]) {
      const formattedWord = word.replace(/([^0-9a-zA-Z]+)/g, "");
      const cacheKey = `${formattedWord.toLowerCase()}`;
      const cached = getFromThesaurusCache(cacheKey);
      if (cached) {
        const data = cached as unknown;
        if (this.isThesaurusResultModelV2Array(data)) {
          responseData = await this.getWordsToUse(data as ThesaurusResultModelV2[]);
        } else if (Array.isArray(data) && this.isStringArray(data)) {
          responseData = await this.getWordsFromResponse(data as string[]);
        }
        continue;
      }

      const mWThesaurus = `${this.baseThesaurusUrl}/${formattedWord}/?key=${this.apiKey}`;
      try {
        const synonyms = await axios.get(mWThesaurus);
        setThesaurusCache(cacheKey, synonyms.data);
        if (this.isThesaurusResultModelV2Array(synonyms.data)) {
          responseData = await this.getWordsToUse(synonyms.data);
        } else {
          responseData = await this.getWordsFromResponse(synonyms.data);
        }
      } catch (error) {
        console.error(error);
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
      if (this.isThesaurusResultModelV2(entry)) {
        resultsInFunction = resultsInFunction.concat(entry.meta.stems);
        resultsInFunction = resultsInFunction.concat(
          (entry.meta.syns as string[][]).flat(3),
        );
      }
    }

    return resultsInFunction;
  }

  private generateUsernames(
    responseData: string[],
    specialCharacters?: string[],
  ) {
    console.log(responseData);
    const usernames: string[] = [];
    for (let i = 1; i < responseData.length; i++) {
      const responseIndexGenerator = () =>
        this.randomResponseDataIndex(i, responseData);
      const responseDefaultIndexGenerator = () => this.randomDefaultIndex();
      const randomNumberGenerator = (arrLength?: number) =>
        this.randomIndex(arrLength);

      for (let i = 0; i < 15; i++) {
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
