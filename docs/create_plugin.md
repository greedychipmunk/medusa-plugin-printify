# Create a Plugin

In this chapter, you'll learn how to create a Medusa plugin and publish it.

A [plugin](https://docs.medusajs.com/learn/fundamentals/plugins) is a package of reusable Medusa customizations that you can install in any Medusa application. By creating and publishing a plugin, you can reuse your Medusa customizations across multiple projects or share them with the community.

Plugins are available starting from [Medusa v2.3.0](https://github.com/medusajs/medusa/releases/tag/v2.3.0).

## 1. Create a Plugin Project

Plugins are created in a separate Medusa project. This makes the development and publishing of the plugin easier. Later, you'll install that plugin in your Medusa application to test it out and use it.

Medusa's `create-medusa-app` CLI tool provides the option to create a plugin project. Run the following command to create a new plugin project:

```bash npx2yarnExec
npx create-medusa-app my-plugin --plugin
```

This will create a new Medusa plugin project in the `my-plugin` directory.

### Plugin Directory Structure

After the installation is done, the plugin structure will look like this:

![Directory structure of a plugin project](https://res.cloudinary.com/dza7lstvk/image/upload/v1737019441/Medusa%20Book/project-dir_q4xtri.jpg)

- `src/`: Contains the Medusa customizations.
- `src/admin`: Contains [admin extensions](https://docs.medusajs.com/learn/fundamentals/admin).
- `src/api`: Contains [API routes](https://docs.medusajs.com/learn/fundamentals/api-routes) and [middlewares](https://docs.medusajs.com/learn/fundamentals/api-routes/middlewares). You can add store, admin, or any custom API routes.
- `src/jobs`: Contains [scheduled jobs](https://docs.medusajs.com/learn/fundamentals/scheduled-jobs).
- `src/links`: Contains [module links](https://docs.medusajs.com/learn/fundamentals/module-links).
- `src/modules`: Contains [modules](https://docs.medusajs.com/learn/fundamentals/modules).
- `src/provider`: Contains [module providers](#create-module-providers).
- `src/subscribers`: Contains [subscribers](https://docs.medusajs.com/learn/fundamentals/events-and-subscribers).
- `src/workflows`: Contains [workflows](https://docs.medusajs.com/learn/fundamentals/workflows). You can also add [hooks](https://docs.medusajs.com/learn/fundamentals/workflows/add-workflow-hook) under `src/workflows/hooks`.
- `package.json`: Contains the plugin's package information, including general information and dependencies.
- `tsconfig.json`: Contains the TypeScript configuration for the plugin.

***

## 2. Prepare Plugin

### Package Name

Before developing, testing, and publishing your plugin, make sure its name in `package.json` is correct. This is the name you'll use to install the plugin in your Medusa application.

For example:

```json title="package.json"
{
  "name": "@myorg/plugin-name",
  // ...
}
```

### Package Keywords

Medusa scrapes NPM for a list of plugins that integrate third-party services, to later showcase them on the Medusa website. If you want your plugin to appear in that listing, make sure to add the `medusa-v2` and `medusa-plugin-integration` keywords to the `keywords` field in `package.json`.

Only plugins that integrate third-party services are listed in the Medusa integrations page. If your plugin doesn't integrate a third-party service, you can skip this step.

```json title="package.json"
{
  "keywords": [
    "medusa-plugin-integration",
    "medusa-v2"
  ],
  // ...
}
```

In addition, make sure to use one of the following keywords based on your integration type:

|Keyword|Description|Example|
|---|---|---|
|\`medusa-plugin-analytics\`|Analytics service integration|Google Analytics|
|\`medusa-plugin-auth\`|Authentication service integration|Auth0|
|\`medusa-plugin-cms\`|CMS service integration|Contentful|
|\`medusa-plugin-notification\`|Notification service integration|Twilio SMS|
|\`medusa-plugin-payment\`|Payment service integration|PayPal|
|\`medusa-plugin-search\`|Search service integration|MeiliSearch|
|\`medusa-plugin-shipping\`|Shipping service integration|DHL|
|\`medusa-plugin-other\`|Other third-party integrations|Sentry|

### Package Dependencies

Your plugin project will already have the dependencies mentioned in this section. Unless you made changes to the dependencies, you can skip this section.

In the `package.json` file you must have the Medusa dependencies as `devDependencies` and `peerDependencies`. In addition, you must have `@swc/core` as a `devDependency`, as it's used by the plugin CLI tools.

For example, assuming `2.5.0` is the latest Medusa version:

```json title="package.json"
{
  "devDependencies": {
    "@medusajs/admin-sdk": "2.5.0",
    "@medusajs/cli": "2.5.0",
    "@medusajs/framework": "2.5.0",
    "@medusajs/medusa": "2.5.0",
    "@medusajs/test-utils": "2.5.0",
    "@medusajs/ui": "4.0.4",
    "@medusajs/icons": "2.5.0",
    "@swc/core": "1.5.7",
  },
  "peerDependencies": {
    "@medusajs/admin-sdk": "2.5.0",
    "@medusajs/cli": "2.5.0",
    "@medusajs/framework": "2.5.0",
    "@medusajs/test-utils": "2.5.0",
    "@medusajs/medusa": "2.5.0",
    "@medusajs/ui": "4.0.3",
    "@medusajs/icons": "2.5.0",
  }
}
```

### Package Exports

Your plugin project will already have the exports mentioned in this section. Unless you made changes to the exports or you created your plugin before [Medusa v2.7.0](https://github.com/medusajs/medusa/releases/tag/v2.7.0), you can skip this section.

In the `package.json` file, make sure your plugin has the following exports:

```json title="package.json"
{
  "exports": {
    "./package.json": "./package.json",
    "./workflows": "./.medusa/server/src/workflows/index.js",
    "./.medusa/server/src/modules/*": "./.medusa/server/src/modules/*/index.js",
    "./providers/*": "./.medusa/server/src/providers/*/index.js",
    "./admin": {
      "import": "./.medusa/server/src/admin/index.mjs",
      "require": "./.medusa/server/src/admin/index.js",
      "default": "./.medusa/server/src/admin/index.js"
    },
    "./*": "./.medusa/server/src/*.js"
  }
}
```

Aside from the `./package.json`, `./providers`, and `./admin`, these exports are only a recommendation. You can cherry-pick the files and directories you want to export.

The plugin exports the following files and directories:

- `./package.json`: The `package.json` file. Medusa needs to access the `package.json` when registering the plugin.
- `./workflows`: The workflows exported in `./src/workflows/index.ts`.
- `./.medusa/server/src/modules/*`: The definition file of modules. This is useful if you create links to the plugin's modules in the Medusa application.
- `./providers/*`: The definition file of module providers. This is useful if your plugin includes a module provider, allowing you to register the plugin's providers in Medusa applications. Learn more in the [Create Module Providers](#create-module-providers) section.
- `./admin`: The admin extensions exported in `./src/admin/index.ts`.
- `./*`: Any other files in the plugin's `src` directory.

***

## 3. Publish Plugin Locally for Development and Testing

Medusa's CLI tool provides commands to simplify developing and testing your plugin in a local Medusa application. You start by publishing your plugin in the local package registry, then install it in your Medusa application. You can then watch for changes in the plugin as you develop it.

### Publish and Install Local Package

### Prerequisites

- [Medusa application installed.](https://docs.medusajs.com/learn/installation)

The first time you create your plugin, you need to publish the package into a local package registry, then install it in your Medusa application. This is a one-time only process.

To publish the plugin to the local registry, run the following command in your plugin project:

```bash npx2yarn title="Plugin project"
npx medusa plugin:publish
```

This command uses [Yalc](https://github.com/wclr/yalc) under the hood to publish the plugin to a local package registry. The plugin is published locally under the name you specified in `package.json`.

Next, navigate to your Medusa application:

```bash title="Medusa application"
cd ~/path/to/medusa-app
```

Make sure to replace `~/path/to/medusa-app` with the path to your Medusa application.

Then, if your project was created before v2.3.1 of Medusa, make sure to install `yalc` as a development dependency:

```bash npm2yarn badgeLabel="Medusa Application" badgeColor="green"
npm install --save-dev yalc
```

After that, run the following Medusa CLI command to install the plugin:

```bash npx2yarn title="Medusa application"
npx medusa plugin:add @myorg/plugin-name
```

Make sure to replace `@myorg/plugin-name` with the name of your plugin as specified in `package.json`. Your plugin will be installed from the local package registry into your Medusa application.

### Register Plugin in Medusa Application

After installing the plugin, you need to register it in your Medusa application in the configurations defined in `medusa-config.ts`.

Add the plugin to the `plugins` array in the `medusa-config.ts` file:

```ts title="medusa-config.ts" highlights={pluginHighlights}
module.exports = defineConfig({
  // ...
  plugins: [
    {
      resolve: "@myorg/plugin-name",
      options: {},
    },
  ],
})
```

The `plugins` configuration is an array of objects where each object has a `resolve` key whose value is the name of the plugin package.

#### Pass Module Options through Plugin

Each plugin configuration also accepts an `options` property, whose value is an object of options to pass to the plugin's modules.

For example:

```ts title="medusa-config.ts" highlights={pluginOptionsHighlight}
module.exports = defineConfig({
  // ...
  plugins: [
    {
      resolve: "@myorg/plugin-name",
      options: {
        apiKey: true,
      },
    },
  ],
})
```

The `options` property in the plugin configuration is passed to all modules in the plugin. Learn more about module options in [this chapter](https://docs.medusajs.com/learn/fundamentals/modules/options).

### Watch Plugin Changes During Development

While developing your plugin, you can watch for changes in the plugin and automatically update the plugin in the Medusa application using it. This is the only command you'll continuously need during your plugin development.

To do that, run the following command in your plugin project:

```bash npx2yarn title="Plugin project"
npx medusa plugin:develop
```

This command will:

- Watch for changes in the plugin. Whenever a file is changed, the plugin is automatically built.
- Publish the plugin changes to the local package registry. This will automatically update the plugin in the Medusa application using it. You can also benefit from real-time HMR updates of admin extensions.

### Start Medusa Application

You can start your Medusa application's development server to test out your plugin:

```bash npm2yarn badgeLabel="Medusa Application" badgeColor="green"
npm run dev
```

While your Medusa application is running and the plugin is being watched, you can test your plugin while developing it in the Medusa application.

***

## 4. Create Customizations in the Plugin

You can now build your plugin's customizations. The following guide explains how to build different customizations in your plugin.

- [Create a module](https://docs.medusajs.com/learn/fundamentals/modules)
- [Create a module link](https://docs.medusajs.com/learn/fundamentals/module-links)
- [Create a workflow](https://docs.medusajs.com/learn/fundamentals/workflows)
- [Add a workflow hook](https://docs.medusajs.com/learn/fundamentals/workflows/add-workflow-hook)
- [Create an API route](https://docs.medusajs.com/learn/fundamentals/api-routes)
- [Add a subscriber](https://docs.medusajs.com/learn/fundamentals/events-and-subscribers)
- [Add a scheduled job](https://docs.medusajs.com/learn/fundamentals/scheduled-jobs)
- [Add an admin widget](https://docs.medusajs.com/learn/fundamentals/admin/widgets)
- [Add an admin UI route](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes)

While building those customizations, you can test them in your Medusa application by [watching the plugin changes](#watch-plugin-changes-during-development) and [starting the Medusa application](#start-medusa-application).

### Generating Migrations for Modules

During your development, you may need to generate migrations for modules in your plugin. To do that, first, add the following environment variables in your plugin project:

```plain title="Plugin project"
DB_USERNAME=postgres
DB_PASSWORD=123...
DB_HOST=localhost
DB_PORT=5432
DB_NAME=db_name
```

You can add these environment variables in a `.env` file in your plugin project. The variables are:

- `DB_USERNAME`: The username of the PostgreSQL user to connect to the database.
- `DB_PASSWORD`: The password of the PostgreSQL user to connect to the database.
- `DB_HOST`: The host of the PostgreSQL database. Typically, it's `localhost` if you're running the database locally.
- `DB_PORT`: The port of the PostgreSQL database. Typically, it's `5432` if you're running the database locally.
- `DB_NAME`: The name of the PostgreSQL database to connect to.

Then, run the following command in your plugin project to generate migrations for the modules in your plugin:

```bash npx2yarn title="Plugin project"
npx medusa plugin:db:generate
```

This command generates migrations for all modules in the plugin.

Finally, run these migrations on the Medusa application that the plugin is installed in using the `db:migrate` command:

```bash npx2yarn title="Medusa application"
npx medusa db:migrate
```

The migrations in your application, including your plugin, will run and update the database.

### Importing Module Resources

In the [Prepare Plugin](#2-prepare-plugin) section, you learned about [exported resources](#package-exports) in your plugin.

These exports allow you to import your plugin resources in your Medusa application, including workflows, links and modules.

For example, to import the plugin's workflow in your Medusa application:

`@myorg/plugin-name` is the plugin package's name.

```ts
import { Workflow1, Workflow2 } from "@myorg/plugin-name/workflows"
import BlogModule from "@myorg/plugin-name/modules/blog"
// import other files created in plugin like ./src/types/blog.ts
import BlogType from "@myorg/plugin-name/types/blog"
```

### Create Module Providers

The [exported resources](#package-exports) also allow you to import module providers in your plugin and register them in the Medusa application's configuration. A module provider is a module that provides the underlying logic or integration related to a commerce or Infrastructure Module.

For example, assuming your plugin has a [Notification Module Provider](https://docs.medusajs.com/resources/infrastructure-modules/notification) called `my-notification`, you can register it in your Medusa application's configuration like this:

`@myorg/plugin-name` is the plugin package's name.

```ts highlights={[["9"]]} title="medusa-config.ts"
module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@myorg/plugin-name/providers/my-notification",
            id: "my-notification",
            options: {
              channels: ["email"],
              // provider options...
            },
          },
        ],
      },
    },
  ],
})
```

You pass to `resolve` the path to the provider relative to the plugin package. So, in this example, the `my-notification` provider is located in `./src/providers/my-notification/index.ts` of the plugin.

To learn how to create module providers, refer to the following guides:

- [File Module Provider](https://docs.medusajs.com/resources/references/file-provider-module)
- [Notification Module Provider](https://docs.medusajs.com/resources/references/notification-provider-module)
- [Auth Module Provider](https://docs.medusajs.com/resources/references/auth/provider)
- [Payment Module Provider](https://docs.medusajs.com/resources/references/payment/provider)
- [Fulfillment Module Provider](https://docs.medusajs.com/resources/references/fulfillment/provider)
- [Tax Module Provider](https://docs.medusajs.com/resources/references/tax/provider)

***

## 5. Publish Plugin to NPM

Make sure to add the keywords mentioned in the [Package Keywords](#package-keywords) section in your plugin's `package.json` file.

Medusa's CLI tool provides a command that bundles your plugin to be published to npm. Once you're ready to publish your plugin publicly, run the following command in your plugin project:

```bash npx2yarn
npx medusa plugin:build
```

The command will compile an output in the `.medusa/server` directory.

You can now publish the plugin to npm using the [NPM CLI tool](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Run the following command to publish the plugin to npm:

```bash
npm publish
```

If you haven't logged in before with your NPM account, you'll be asked to log in first. Then, your package is published publicly to be used in any Medusa application.

### Install Public Plugin in Medusa Application

You install a plugin that's published publicly using your package manager. For example:

```bash npm2yarn
npm install @myorg/plugin-name
```

Where `@myorg/plugin-name` is the name of your plugin as published on NPM.

Then, register the plugin in your Medusa application's configurations as explained in [this section](#register-plugin-in-medusa-application).

***

## Update a Published Plugin

To update the Medusa dependencies in a plugin, refer to [this documentation](https://docs.medusajs.com/learn/update#update-plugin-project).

If you've published a plugin and you've made changes to it, you'll have to publish the update to NPM again.

First, run the following command to change the version of the plugin:

```bash
npm version <type>
```

Where `<type>` indicates the type of version update you’re publishing. For example, it can be `major` or `minor`. Refer to the [npm version documentation](https://docs.npmjs.com/cli/v10/commands/npm-version) for more information.

Then, re-run the same commands for publishing a plugin:

```bash npx2yarn
npx medusa plugin:build
```

```bash npm2yarn
npm publish
```

This will publish an updated version of your plugin under a new version.
