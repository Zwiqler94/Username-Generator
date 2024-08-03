import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import axios from "axios";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { defaultWords } from "../constants/default-words";
import { ThesaurusResultModelV2 } from "../models/thesaurus.model";
import { readFileSync } from "fs";
// import { parse } from "csv";
import path from "path";
// import * as readline from "readline";


export class UsernameGenerator {
  private _name =
    "projects/853416854561/secrets/MW_THESAURUS_API/versions/latest";

  private _baseThesaurusUrl =
    "https://www.dictionaryapi.com/api/v3/references/thesaurus/json";

  private client = new SecretManagerServiceClient();

  private apiKey = "";

  get name() {
    return this._name;
  }

  get baseThesaurusUrl() {
    return this._baseThesaurusUrl;
  }

  async getBadWords() {
    const data: string[] = readFileSync(
     path.join(__dirname, "bad-words.csv"),
      "utf-8"
    ).split('\n').sort();
    console.debug(data)
    return data;
  }

  generateUsernameHandler = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        throw new Error("Bad Request Body");
      }
      let usernames: string[] = [];
      const [apiKeyVersion] = await this.client.accessSecretVersion({
        name: this.name,
      });
      this.apiKey = apiKeyVersion.payload!.data!.toString();
      const maxLength = req.query.maxlength ? Number(req.query.maxlength) : 20;
      let responseData: string[] = [];
      if (req.body.words.length > 1) {
        const words = req.body.words as string[];

        const badWords = await this.getBadWords();

        // console.debug({ x });

       const processedWords = words.filter(
          (word) => {
            return !badWords.includes(word);
          }
       );
        responseData = await this.getWordsFromResponse(processedWords);
      } else {
        responseData = await this.getWordsFromResponse(defaultWords);
      }

      if (req.body.specials !== undefined && req.body.specials.length > 0) {
        usernames = this.generateUsernames(responseData, req.body.specials);
      } else {
        usernames = this.generateUsernames(responseData);
      }

      res
        .status(200)
        .send(usernames.filter((username) => username.length <= maxLength));
    } catch (error) {
      console.error(`${error}: ${JSON.stringify(errors)}`);
      res.status(400).json(errors);
      throw error;
    }
  };

  private async getWordsFromResponse(words: string[]) {
    let responseData: string[] = [];
    // words = (words as string[]).filter(word=>word.length <= 3);
    for (const word of words as string[]) {
      console.debug({word})
      const mWThesaurus = `${this.baseThesaurusUrl}/${word}/?key=${this.apiKey}`;
      try {
        const synonyms = await axios.get(mWThesaurus);
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

  isThesaurusResultModelV2 = (data: any): data is ThesaurusResultModelV2 => {
    return (data as ThesaurusResultModelV2).meta !== undefined;
  };

  isThesaurusResultModelV2Array = (data: any) => {
    return (data as ThesaurusResultModelV2[]).every(
      (entry: ThesaurusResultModelV2) => entry.meta !== undefined
    );
  };

  isStringArray = (arr: any[]) => {
    return arr.every((i) => typeof i === "string");
  };

  private async getWordsToUse(data: ThesaurusResultModelV2[]) {
    let resultsInFunction: any[] = [];

    for (const entry of data) {
      if (this.isThesaurusResultModelV2(entry)) {
        resultsInFunction = resultsInFunction.concat(entry.meta.stems);
        resultsInFunction = resultsInFunction.concat(
          (entry.meta.syns as string[][]).flat(3)
        );
      }
    }

    return resultsInFunction;
  }

  private generateUsernames(
    responseData: string[],
    specialCharacters?: string[]
  ) {
    console.log(responseData);
    let usernames: string[] = [];
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
            specialCharacters!
          ).join("")
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
    specialCharacters: string[]
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
      ])
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
    const trimRegex = /[\s'\(\)-]+/;
    let result: string[] | string = word.trim().split(trimRegex);
    if (typeof result !== "string" && result.length > 1) {
      result = result.map((fragment: string) => {
        if (fragment.length > 1) {
          let fragmentResult = fragment.at(0)!.toUpperCase();
          fragmentResult += fragment.substring(1);
          return fragmentResult;
        } else {
          return this.capitalizeWord(
            defaultWords[Math.floor(Math.random() * defaultWords.length)]
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
