/*
 * This code includes portions of code from the opencommit project, which is
 * licensed under the MIT License. Copyright (c) Dima Sukharev.
 * The original code can be found at https://github.com/di-sukharev/opencommit/blob/master/src/generateCommitMessageFromGitDiff.ts.
 */

import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
  Configuration,
  OpenAIApi,
} from "openai";

import { trimNewLines } from "@utils/text";
import {
  Configuration as AppConfiguration,
  getConfiguration,
} from "@utils/configuration";

import { MsgGenerator } from "./msg-generator";

const config = {
  gptVersion: "gpt-4",
  temperature: 0.2,
  maxTokens: 196,
  language: "english",
  emoji: false,
  description: false,
};
const configuration = getConfiguration();

const defaultContent = `You are to act as the author of a commit message in git. Your mission is to create clean and comprehensive commit messages in the conventional commit convention. I'll send you an output of 'git diff --staged' command, and you convert it into a commit message. Do not preface the commit with anything, use the present tense. Don't add any descriptions to the commit, only commit message. Use ${configuration.general.language} language to answer.`;

// Open Commit
export const IDENTITY =
  "You are to act as the author of a commit message in git.";
const openCommitContent = `${IDENTITY} Your mission is to create clean and comprehensive commit messages as per the conventional commit convention and explain WHAT were the changes and mainly WHY the changes were done. I'll send you an output of 'git diff --staged' command, and you are to convert it into a commit message.
${
  configuration.general.emoji === "true"
    ? "Use GitMoji convention to preface the commit."
    : "Do not preface the commit with anything."
}
${
  configuration.general.description === "true"
    ? 'Add a short description of WHY the changes are done after the commit message. Don\'t start it with "This commit", just describe the changes.'
    : "Don't add any descriptions to the commit, only commit message."
}
Use the present tense. Lines must not be longer than 74 characters. Use ${
  configuration.general.language.substring(0, 2) ||
  config.language.substring(0, 2)
} language for the commit message.`;

// https://gitlab.com/kerkmann/commitgpt/-/blob/main/src/main.rs?ref_type=heads
const commitGpt = `You are a helpful assistant which helps to write commit messages based on the given diff and reason.\n
The first line is explaining why there are specific changes and the other lines describes what have been changed.\n
Follow the following git commit message convention:\n
<type>: <description>\n

<why>\n

Changes:\n
<what>`;

const myPrompt = `You are a helpful assistant which helps to write commit messages based on the given diff and reason.
The first line is explaining why there are specific changes and the other lines describes what have been changed. Use gitmoji. 
Use ${
  configuration.general.language.substring(0, 2) ||
  config.language.substring(0, 2)
} language for the commit message. 
Follow the following git commit message convention:
start-with-gitmoji? type(scope?): subject
body?
footer?`;

const initMessagesPrompt: Array<ChatCompletionRequestMessage> = [
  {
    role: ChatCompletionRequestMessageRoleEnum.System,
    content: commitGpt,
  },
  /*
  {
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: `diff --git a/src/server.ts b/src/server.ts
    index ad4db42..f3b18a9 100644
    --- a/src/server.ts
    +++ b/src/server.ts
    @@ -10,7 +10,7 @@ import {
      initWinstonLogger();
      
      const app = express();
    -const port = 7799;
    +const PORT = 7799;
      
      app.use(express.json());
      
    @@ -34,6 +34,6 @@ app.use((_, res, next) => {
      // ROUTES
      app.use(PROTECTED_ROUTER_URL, protectedRouter);
      
    -app.listen(port, () => {
    -  console.log(\`Server listening on port \${port}\`);
    +app.listen(process.env.PORT || PORT, () => {
    +  console.log(\`Server listening on port \${PORT}\`);
      });`,
  },
  {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: `fix(server.ts): change port variable case from lowercase port to uppercase PORT
        feat(server.ts): add support for process.env.PORT environment variable`,
  },
  */
];

function generateCommitMessageChatCompletionPrompt(
  diff: string
): Array<ChatCompletionRequestMessage> {
  const chatContextAsCompletionRequest = [...initMessagesPrompt];

  chatContextAsCompletionRequest.push({
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: diff,
  });

  return chatContextAsCompletionRequest;
}

const defaultModel = "gpt-3.5-turbo-16k";
const defaultTemperature = 0.2;
const defaultMaxTokens = 196;

export class ChatgptMsgGenerator implements MsgGenerator {
  openAI: OpenAIApi;
  config?: AppConfiguration["openAI"];

  constructor(config: AppConfiguration["openAI"]) {
    this.openAI = new OpenAIApi(
      new Configuration({
        apiKey: config.apiKey,
      }),
      config.customEndpoint?.trim() || undefined
    );
    this.config = config;
  }

  async generate(diff: string, delimeter?: string) {
    const messages = generateCommitMessageChatCompletionPrompt(diff);
    const { data } = await this.openAI.createChatCompletion({
      model: this.config?.gptVersion || defaultModel,
      messages: messages,
      temperature: this.config?.temperature || defaultTemperature,
      ["max_tokens"]: this.config?.maxTokens || defaultMaxTokens,
    });

    const message = data?.choices[0].message;
    const commitMessage = message?.content;

    if (!commitMessage) {
      throw new Error("No commit message were generated. Try again.");
    }

    const alignedCommitMessage = trimNewLines(commitMessage, delimeter);
    return alignedCommitMessage;
  }
}
