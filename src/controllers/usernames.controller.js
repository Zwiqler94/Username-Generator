"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsernameGenerator = void 0;
const secret_manager_1 = require("@google-cloud/secret-manager");
const axios_1 = __importDefault(require("axios"));
const express_validator_1 = require("express-validator");
const default_words_1 = require("../constants/default-words");
class UsernameGenerator {
    constructor() {
        this._name = "projects/853416854561/secrets/MW_THESAURUS_API/versions/1";
        this._baseThesaurusUrl = "https://www.dictionaryapi.com/api/v3/references/thesaurus/json";
        this.client = new secret_manager_1.SecretManagerServiceClient();
        this.apiKey = "";
        this.generateUsernameHandler = (req, res) => __awaiter(this, void 0, void 0, function* () {
            const errors = (0, express_validator_1.validationResult)(req);
            try {
                if (!errors.isEmpty()) {
                    throw new Error("Bad Request Body");
                }
                let usernames = [];
                const [apiKeyVersion] = yield this.client.accessSecretVersion({
                    name: this.name,
                });
                this.apiKey = apiKeyVersion.payload.data.toString();
                const maxLength = req.query.maxlength ? Number(req.query.maxlength) : 20;
                let responseData = [];
                if (req.body.words.length > 1) {
                    responseData = yield this.getWordsFromResponse(req.body.words);
                }
                else {
                    responseData = yield this.getWordsFromResponse(default_words_1.defaultWords);
                }
                if (req.body.specials !== undefined && req.body.specials.length > 0) {
                    usernames = this.generateUsernames(responseData, req.body.specials);
                }
                else {
                    usernames = this.generateUsernames(responseData);
                }
                res
                    .status(200)
                    .send(usernames.filter((username) => username.length <= maxLength));
            }
            catch (error) {
                throw error;
                console.log(`${error}: ${JSON.stringify(errors)}`);
                res.status(400).json(errors);
            }
        });
        this.isThesaurusResultModelV2 = (data) => {
            return data.meta !== undefined;
        };
        this.isThesaurusResultModelV2Array = (data) => {
            return data.every((entry) => entry.meta !== undefined);
        };
        this.isStringArray = (arr) => {
            return arr.every((i) => typeof i === "string");
        };
    }
    get name() {
        return this._name;
    }
    get baseThesaurusUrl() {
        return this._baseThesaurusUrl;
    }
    getWordsFromResponse(words) {
        return __awaiter(this, void 0, void 0, function* () {
            let responseData = [];
            for (const word of words) {
                const mWThesaurus = `${this.baseThesaurusUrl}/${word}/?key=${this.apiKey}`;
                try {
                    const synonyms = yield axios_1.default.get(mWThesaurus);
                    if (this.isThesaurusResultModelV2Array(synonyms.data)) {
                        responseData = yield this.getWordsToUse(synonyms.data);
                    }
                    else {
                        responseData = yield this.getWordsFromResponse(synonyms.data);
                    }
                }
                catch (error) {
                    console.log(error);
                }
            }
            return responseData;
        });
    }
    getWordsToUse(data) {
        return __awaiter(this, void 0, void 0, function* () {
            let resultsInFunction = [];
            for (const entry of data) {
                if (this.isThesaurusResultModelV2(entry)) {
                    resultsInFunction = resultsInFunction.concat(entry.meta.stems);
                    resultsInFunction = resultsInFunction.concat(entry.meta.syns.flat(3));
                }
            }
            return resultsInFunction;
        });
    }
    generateUsernames(responseData, specialCharacters) {
        let usernames = [];
        for (let i = 1; i < responseData.length; i++) {
            const responseIndexGenerator = () => this.randomResponseDataIndex(i, responseData);
            const responseDefaultIndexGenerator = () => this.randomDefaultIndex();
            const randomNumberGenerator = (arrLength) => this.randomIndex(arrLength);
            for (let i = 0; i < 15; i++) {
                usernames.push(this.createUsername(responseData, responseIndexGenerator, responseDefaultIndexGenerator, randomNumberGenerator, specialCharacters).join(""));
            }
        }
        return Array.from(new Set(usernames));
    }
    createUsername(responseData, responseIndexGenerator, responseDefaultIndexGenerator, randomNumberGenerator, specialCharacters) {
        return Array.from(new Set([
            responseData.length > responseIndexGenerator()
                ? this.capitalizeWord(responseData[responseIndexGenerator()])
                : this.capitalizeWord(default_words_1.defaultWords[responseDefaultIndexGenerator()]),
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
                : this.capitalizeWord(default_words_1.defaultWords[responseDefaultIndexGenerator()]),
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
                : this.capitalizeWord(default_words_1.defaultWords[responseDefaultIndexGenerator()]),
            randomNumberGenerator() % 31 === 0
                ? String(randomNumberGenerator())
                : "",
            specialCharacters !== undefined &&
                specialCharacters.length > 0 &&
                randomNumberGenerator() % 31 === 0
                ? specialCharacters[randomNumberGenerator(specialCharacters.length)]
                : "",
        ]));
    }
    randomResponseDataIndex(i, responseData) {
        return Math.floor((Math.random() * (i + 24)) % responseData.length);
    }
    randomDefaultIndex() {
        return Math.floor(Math.random() * default_words_1.defaultWords.length);
    }
    randomIndex(arrLength) {
        const length = arrLength ? arrLength : 2938;
        return Math.floor(Math.random() * length);
    }
    capitalizeWord(word) {
        const trimRegex = /[\s'\(\)-]+/;
        let result = word.trim().split(trimRegex);
        if (typeof result !== "string" && result.length > 1) {
            result = result.map((fragment) => {
                if (fragment.length > 1) {
                    let fragmentResult = fragment.at(0).toUpperCase();
                    fragmentResult += fragment.substring(1);
                    return fragmentResult;
                }
                else {
                    return this.capitalizeWord(default_words_1.defaultWords[Math.floor(Math.random() * default_words_1.defaultWords.length)]);
                }
            });
            result = result.join("");
        }
        else {
            result = word.at(0).toUpperCase();
            result += word.substring(1);
        }
        return result;
    }
}
exports.UsernameGenerator = UsernameGenerator;
