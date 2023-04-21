# copilot-survey-engine

> A GitHub App built with [Probot](https://github.com/probot/probot) to prompt developers about their experience with Copilot!

## App Objective

As more companies adopt Copilot, there's an increasing need to measure the benefits in the organization. For such it is important to have in mind not only to do a quantitative analysis, but also qualitative. Combining quantitative and qualitative analysis is crucial in understanding the developer experience when using a tool. While quantitative analysis can provide valuable insights into usage patterns, adoption rates, and other measurable data, it doesn't tell the full story of how developers feel about a tool. Specially taking into consideration that there's many ways to interact with Copilot and get value from it, but not all of these are possible to be captured in KPIs as of now. 

To gain a deeper understanding of user satisfaction, a qualitative survey is key. This app intends to help companis on that journey, so we can start with 3 basic questions and integrate them in the very tool, so it's also part of the DevOps lifecycle. This information is hosted on a database so it can provide insight into how developers are using the tool, what value they're perceiving to receive and challenges that have been presented.

I hope you can get value from this project and feel free to contribute and build on top of this!

## How it works

The App listens on 3 main events: Pull Request closed, issue edited and issue comment created. Once a Pull Request has been closed, the workflow will trigger and create an issue asking the identified survey questions. We are able to support English, Spanish and Portuguese, so the engine will do a language analysis on the description of the Pull Request to try to match the same language in the issue creation. 

Once the issue is created, the following questions are presented to the developer:

### Copilot Usage Survey

Hi! 👋  As part of our efforts to continually improve our DevOps processes, we would like to gather your valuable feedback on your experience with Copilot for Pull Request #26 by asking the following questions:

1. Did Copilot save time or increase productivity in developing this component?
- Yes
- No
2. If answer 1 is Yes, how much was the improvement (5%, 10%, 20%, 30% or more)?
- <5%
- 5%-10%
- 10%-20%
- 20%-30%
- \>30%
3. If answer 1 is No, please explain why in a comment

As we receive edits on the issue, the App will validate the responses received (options selected) and once all questions have been answered, the issue will be closed automatically and the responses will be saved into a database. 

## Setup. Deploy on your own environment

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

Once you clone the project and execute this commands locally, as a first time execution probot will prompt you for creating a new GitHub App or connect it with an existing App. As you complete the requested information, a .env file will get created in your local source code and all the private information regarding your GitHub App will be automatically written there. You could then modify the deployment settings to deploy the app in the infrastructure of your liking and connect it to your desired database. 

## When running in Docker

```sh
# 1. Build container
docker build -t copilot-survey-engine .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> copilot-survey-engine
```

## Contributing

If you have suggestions for how copilot-survey-engine could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2023 Mabel Geronimo
