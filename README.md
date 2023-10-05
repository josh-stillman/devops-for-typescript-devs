# DevOps for TypeScript Developers

This repo contains the Pulumi infrastructure code for the DevOps for TypeScript Developers tutorial.  The Front-end repo is [here](https://github.com/josh-stillman/devops-for-typescript-devs-frontend), and the Back-end repo is [here](https://github.com/josh-stillman/devops-for-typescript-devs-backend).  The course materials are below.

- [DevOps for TypeScript Developers](#devops-for-typescript-developers)
- [Introduction](#introduction)
  - [Why Learn DevOps as a Developer?](#why-learn-devops-as-a-developer)
  - [The Application](#the-application)
  - [Architecture](#architecture)
    - [Frontend](#frontend)
    - [Backend](#backend)
  - [Why AWS?](#why-aws)
  - [First Principles](#first-principles)
    - [Principle of Least Privilege](#principle-of-least-privilege)
    - [Tradeoffs and Cost](#tradeoffs-and-cost)
  - [Game Plan](#game-plan)
- [Build the Frontend Locally](#build-the-frontend-locally)
  - [Why Next.js](#why-nextjs)
  - [Create Next project](#create-next-project)
    - [Setup your project and GitHub Repository](#setup-your-project-and-github-repository)
    - [Create your first route](#create-your-first-route)
    - [Build a static site for production](#build-a-static-site-for-production)
- [Setup your AWS account](#setup-your-aws-account)
  - [A note on AWS Regions](#a-note-on-aws-regions)
  - [Sign up](#sign-up)
  - [Setup billing alerts](#setup-billing-alerts)
  - [Create account alias](#create-account-alias)
  - [Setup MFA](#setup-mfa)
  - [Create our Admin user](#create-our-admin-user)
  - [Login as Admin and add MFA](#login-as-admin-and-add-mfa)
- [Register a domain](#register-a-domain)
- [Upload our frontend build directory to s3](#upload-our-frontend-build-directory-to-s3)
  - [Create a bucket for your site](#create-a-bucket-for-your-site)
  - [Add a bucket policy allowing access](#add-a-bucket-policy-allowing-access)
  - [Upload our frontend assets](#upload-our-frontend-assets)
  - [Enable Static Website Hosting](#enable-static-website-hosting)
- [Setup the AWS CLI](#setup-the-aws-cli)


# Introduction

Welcome to DevOps for TypeScript Developers!  The goal of this tutorial is to gain practical DevOps experience by building and deploying a full-stack web app on Amazon Web Services (AWS), using TypeScript to create both our application and our infrastructure.

In this tutorial, we'll create and deploy a full stack application using Next.js to build a static frontend, and Strapi, a headless CMS, to serve as our backend.  We'll Dockerize Strapi, then we'll set up CI/CD pipelines with GitHub Actions.  We'll deploy our application's first environment through the AWS console to gain familiarity with the concepts.  Then we'll deploy a second development environment using Pulumi, an infrastructure-as-code framework that lets us use TypeScript to create cloud infrastructure.  We'll see how a tool like Pulumi can give us much more power and control when building cloud infrastructure.

The course is more practical than theoretical. These are deep topics, but they will be presented as simply as possible here, with a lot of details omitted so we can focus on building.  I'll include some links to other great resources that will let you dive deeper and learn more about the concepts.  But I've found there's a huge gap between a conceptual understanding of these topics and actually hacking through the weeds to deploy a real application.  My hope is that this course demystifies DevOps and provides a foundation to start deploying your applications to the world.

The focus here is on deployment, so the site itself will just be a very simple blog.  Please feel free to build on it from here!

## Why Learn DevOps as a Developer?

If we want our applications to reach our users, we have to deploy them!  It's a fact of life.  There are services with an amazing developer experience that will let you do this with very little work, like Netlify, Vercel, or Heroku (often called Platform as a Service or PaaS services). You click a few buttons, link up your GitHub repo, and the service takes care of the rest.

These services are great, but they come with big tradeoffs.  You give up a tremendous amount of control to the platform.  For complex applications, you often need that control to accomplish your goals.  For example, I built a mailing list sign-up website with a serverless backend on Netlify a few years ago and very quickly ran up against the limitations imposed by the platform.  It was easier to get up and running, but harder in the long run.

These services are also expensive at scale.  They are effectively reselling you AWS resources at a markup in exchange for a (much) nicer developer experience.  For client projects, cost concerns generally require us to use AWS or one of its competitors. Thus, if you want to understand how client projects are deployed to production, and perhaps do that deployment yourself or be able to improve the infrastructure, you need to understand how cloud platforms work. These Infrastructure as a Service (IaaS) platforms like AWS provide the low-level building blocks to host your application in the cloud, providing greater control but with a steeper learning curve.

There may not always be a dedicated DevOps engineer on a project, in which case the developers need to own the deployment.  But even if there are dedicated DevOps engineers, having an understanding of how all the moving pieces fit together is a huge asset as a developer.  As you plan your application's architecture, understanding how it will be deployed is a must to have an informed conversation with the DevOps team and make the best decisions.

And understanding DevOps can help tremendously with debugging your application in production.  I remember on a client project we faced a mysterious bug where the same API endpoint would return a different price for an item, seemingly at random.  This wasn't happening locally.  It turned out that there were two instances of the backend deployed into production behind a load balancer, and each had cached a different price in memory (one of which was no longer correct).  Understanding the deployed architecture made all the difference for the developers in fixing this bug.

I won't lie--standing up cloud infrastructure can be pretty tedious compared to writing application logic.  There are a lot of gotchas and foot-guns; forgetting small details like extra colons at the end of your secret manager URI can break your entire app. Debugging is generally slow because of the slow feedback loop between deploying and receiving an error message.  Documentation can be lacking or unclear.  But it's incredibly rewarding and powerful to be able to deploy your application to the world.

My goal here is to make DevOps more accessible to Typescript developers, remove a lot of that initial pain of getting started (I already felt it for you!), and let you get up and running.  Using a tool like Pulumi lets us leverage everything we love about TypeScript and start to get a tighter feedback loop and greater control as we write our infrastructure code.

## The Application

The frontend will start out as a simple hello world page that shows the current environment.  It will be statically rendered using Next.  There will be multiple routes, the main page at `/` and a second page at `/foo`, so we can get a handle on routing.

The frontend will display items from a "news feed."  On the client, the app will make a call to our Strapi backend, which will serve the latest news items.  Strapi provides an admin dashboard allowing us to add more items and see them reflected on our frontend in real time.

## Architecture

![architecture diagram](assets/arch-diagram-1.png)

Our application might not look like much, but there's a ton of complexity involved in getting it deployed to the cloud.  At a high level, here are all the moving pieces:

### Frontend

- Requests come in from the browser to our domain (for me, https://jss.computer  - a dev site that was available using my initials 😆). Route 53 routes those requests to our CloudFront Distribution.
  - Requests are served via https, using a TLS certificate provisioned in ACM.
- Cloudfront globally distributes and caches our app for faster load times around the world.
- A Lambda@Edge Function is used to route requests correctly to our HTML files.
- Cloudfront accesses our static assets in an s3 bucket and returns them to the user (and caches them for faster load times for future users.)
- Our s3 Bucket is sealed off from the public Internet for greater security, and only Cloudfront can access it through an "Origin Access Control."
- CI/CD: When new code is merged to our deployed branch in our GitHub repo, the GitHub Actions CI/CD pipeline replaces the old static assets with the new ones in our s3 Bucket.  It creates a Cloudfront "invalidation" telling Cloudfront to fetch the new assets from our s3 bucket on the next user request.

### Backend

- Requests to our backend come into a subdomain on our domain (https://api.jss.computer for me), again served on https using the same TLS certificate.
- Route 53 routes traffic to an Application Load Balancer (ALB), which we're using here primarily for routing.
- The ALB routes traffic to Elastic Container Service.
- Our ECS Service starts our Docker containers for us.  It pulls the images from ECR, and secrets from Amazon Secrets Manager, then starts a container as an ECS "task."
- The request is routed to our Strapi Backend, running in a Docker container as an ECS task, and it responds to the request.
- CI/CD: When new code is merged to our deployed branch in our backend Github Repo, the GitHub Actions CI/CD pipeline creates a new Docker image from the new code, pushes it up to our ECR repo, then edits our ECS Service to point to the newest image, triggering a redeployment.

## Why AWS?

You could do this course with any of the major cloud providers, and Pulumi allows you to use any of them.  I chose AWS because it is the most established and still has the largest market share, so you're more likely to encounter it.

## First Principles

### Principle of Least Privilege

I said we'll be light on theory, but one overriding principle you'll see in the diagram above and throughout the course is the [Principle of Least Privilege](https://www.techtarget.com/searchsecurity/definition/principle-of-least-privilege-POLP).  For security purposes, we want to provide the bare minimum of access to accomplish our goals.  If we lose control of an access key to a hacker, we want to limit the blast radius. And hackers will exploit open ports and publicly accessible resources, so we want to lock our resources down as much as possible.  Some examples:

- When we create an access key for our CI/CD pipeline, we don't want to let it mess with every resource in our account--we want to limit it to only the necessary actions to get the job done, only on the individual resources it needs access to, and only in one environment.
- We don't want to use our root user (used for billing) to do our general admin tasks like creating resources, so we create an admin user with more limited privileges.
- When we expose our application to the Internet, we want to do so through a single point of entry, for control and monitoring.  We don't want to expose our s3 Bucket directly to the public Internet, but rather only allow access to our static assets through our Cloudfront distribution.
- We don't want to expose our backend ECS task directly to the public Internet either; instead we want to allow access only from our load balancer and only on the specified port.

AWS reflects this principle in its permissions model, which generally prohibits access to resources unless explicitly granted.  This is where a lot of the complexity comes in--you'll likely spend time debugging setting up the necessary permissions to accomplish your task.

### Tradeoffs and Cost

Every decision in DevOps comes with tradeoffs, often involving cost.  We can spend the time to stand up our own ECS cluster using our own EC2 virtual machines (more effort), or have AWS do it for us with Fargate (more cost).  We can let AWS assign a public IP to our ECS task so it can access other AWS resources through the public internet (less secure), or set up private VPC endpoints so that traffic doesn't leave Amazon's private network (more effort and more cost).  We already discussed the tradeoffs between a service like Netlify (better experience, higher cost) and a lower-level service like AWS (greater control, lower cost).  The list goes on.  The challenge is to make the right tradeoff for your application's needs.

I'll try to keep us within the AWS free tier as much as possible here, but doing so entirely is very difficult (see this meme).  You can tear down your resources when we're done to limit the damage.  I left my Fargate services and load balancers up all month (both outside the free tier) and was billed about $40 last month 😬.

![AWS Free Tier Meme](assets/aws-free-tier-meme.png)

## Game Plan

Here's the game plan:

- Setup a first environment (production) with the AWS console.
  - Build our frontend locally with Next and set up our GitHub repo.
  - Set up our AWS account.
  - Deploy our frontend through the AWS console.
  - Setup our frontend CI/CD pipeline.
  - Build our backend locally with Strapi and Docker, and set up our GitHub repo.
  - Deploy our backend through the AWS console.
  - Setup our backend CI/CD pipeline.
- Setup a second environment (development) with Pulumi.
  - frontend
  - backend
  - Multiple environments in our GitHub repos.

# Build the Frontend Locally

Let's start with building our frontend so we have something to deploy!

## Why Next.js

We'll be using Next.js to build our frontend, which is a framework built on top of React that provides things like routing and server-side-rendering out-of-the-box.  The official React docs recommend using a framework like Next.js for production applications, and it is becoming broadly adopted by the React community.

Compared to vanilla React app with create-react-app, Next provides much greater control over how your application is rendered.  Vanilla React is rendered on the client--only an empty HTML file is sent to the browser, the React app attaches to an empty div, and renders the entire application with JavaScript.  This poses challenges for SEO, since web crawlers may not render the JavaScript when indexing your site.  It also can lead to slower page loads for users.

> The body of a vanilla React app's `index.html` is just:
> ```html
>  <body>
>    <noscript>You need to enable JavaScript to run this app.</noscript>
>    <div id="root"></div>
> </body>
> ```
> ... Not very informative to web crawlers that might not execute JavaScript!

Next allows much more granular control over where and when your application and its components are rendered.  You can statically render pages to HTML at build time when the content changes infrequently.  You can server-render pages at request time if content changes frequently and things like SEO and fast page-loads are still important (think of e-commerce sites).  And you can also client-render pages and components for dynamic or interactive content, though Next encourages you to client-render as little as possible.

To avoid setting up a server for our frontend, we'll primarily statically-render our site to HTML at build time, and reap all the SEO and performance benefits.  But we'll also load frequently changing data from our news feed in a client-rendered component by fetching data from our backend, so our site will always be up-to-date.  Our app will be built as static assets, just like a vanilla React site, so that we can serve it globally on a CDN for fast loads world-wide.

Check out the excellent [Next docs ](https://nextjs.org/) for a deeper dive on these concepts.  To go even deeper, Josh Comeau's [The Joy of React](https://www.joyofreact.com/) course also has some excellent Next content.

## Create Next project

### Setup your project and GitHub Repository

- Run `npx create-next-app@latest` to bootstrap the app.
- Setup linting and auto-format on save.  Shameless plug for my [lintier](https://github.com/josh-stillman/lintier) npm package, which will do it for you!
  - Run `npx lintier` in the project directory, and don't install airbnb's style guide for now.
  - Turn on auto formatting on save in your VS Code settings.json file, by adding `"editor.codeActionsOnSave": { "source.fixAll": true },`
  - Fix the linting errors in the boilerplate Next starter with `npm run lint:fix`.
- Add your first git commit, and create a [new GitHub repo](https://github.com/new).  Follow the instructions to add the git remote and push up.


### Create your first route

Next provides file-based routing out of the box.  We create new routes and pages by creating new subdirectories in the Next `/app` directory, containing a file named `page.tsx`.  So if we want to create a new page at `/foo`, we add a this new directory and file: `app/foo/page.tsx`.

We're going to create one additional route, so we can learn how to deploy an app with multiple routes. One of the main challenges in getting our frontend deployed comes in handling routing correctly, as we'll see.

- Add the new directory and file: `app/foo/page.tsx`.  It can just say hello world for now.
    ```typescript
    export default function Foo() {
        return <h1>hello world from the foo page!</h1>;
    }
    ```
- On your root page (at `app/page.tsx`), add a link to your new page.  Next's `Link` component handles client-side routing and provides a SPA-like experience, similar to a vanilla React app with React Router.
    ```typescript
    <Link href="/foo">go to foo page!</Link>
    ```

### Build a static site for production

We need to let Next know that we want to build a static site, rather than host our app on a server.  This limits the functionality we have access to (like SSR, of course), but it allows for easier, more lightweight deployment and hosting.  We'll just be uploading static HTML, CSS, and JS assets to a server, where they can be served quickly and cheaply by a CDN, with little effort on our part.

- Setup [static exports](https://nextjs.org/docs/app/building-your-application/deploying/static-exports) in `next.config.js` by adding
    ```typescript
    const nextConfig = {
        output: 'export',
    };

    ```
- Run `npm run build`.  The output shows which files were statically generated with ` ○ (Static)`.
- Checkout the `./out` directory with our built files.  You'll see that, instead of the single empty html file we'd get with a vanilla React App, we get two html files that contain all the content.  This is what enables search engines to easily crawl our site and provides for quick page loads (more specifically, a fast [First Contentful Paint](https://web.dev/fcp/)).
    ```html
    <body class="__className_20951f">
        <h1>hello world from the foo page!</h1>
        ...
    </body>
    ```
- Run the production build of your app by adding and running this script in your `package.json`: `"serve-static": "npx serve ./out",`

# Setup your AWS account

Now it's time to get our frontend deployed!  To go further in depth on a lot of the issues we'll be covering when deploying our frontend through the console, I recommend checking out Steve Kinney's great Frontend Masters course [AWS For Front-End Engineers](https://frontendmasters.com/courses/aws-v2/).

Setting up an AWS account is a bit more complex than you might think. We'll need to:
- create the account
- setup billing notifications so we know when we've gone beyond the free tier.
- setup multi-factor authentication (MFA) for our root user.
- create an Admin user and setup MFA.

We'll only use our root user for things like billing.  Any creation of cloud resources will be done with our Admin user instead, who will have most privileges aside from billing.  This is a security best practice and limits the damage that could be done if our Admin credentials were compromised.

## A note on AWS Regions

AWS has many "regions" around the world in which your cloud infrastructure can live (these correspond to physical data centers).  There are a few things that *must* be in us-east-1 in North Virgina, like CloudFront distributions and TLS certificates.  To make our lives easier, we'll use us-east-1 for everything.

If for some reason you don't see your resources, make sure the us-east-1 region is selected in the dropdown.

## Sign up

Sign up will require a personal credit card.  We'll be incurring some costs but they should be quite low--$12 or so to register a domain, and under $10 for our infrastructure if you tear it down after building it.  It's a worthwhile investment to learn valuable skills!

- Go to https://aws.amazon.com/
- Click the sign up button in the nav bar.
- Enter your personal email and account name.
- Get the verification code from your email (it might be in spam).
- Enter your root password.
- Enter your personal info.
- Enter your credit card.
- Verify with SMS (try the voice captcha option if you have trouble reading the captcha)
- Choose the basic plan.

## Setup billing alerts

The AWS [free tier](https://aws.amazon.com/free) is pretty generous for your first year.  Lots of services are covered up to a large amount of usage, but mysteriouly some smaller services aren't covered at all (load balancers and Fargate for our purposes).  As I said before, we'll mostly be within the free tier, but not entirely.

While we can't tell AWS not to do anything that costs money (how convenient), we can at least set up some notifications to alert us if we go outside of the free tier.

- Navigate to the billing page by typing “billing” in text box.  This is an easy way to navigate through AWS's many services.
- Go to billing preferences.
- Go to alert preferences.
  - Choose AWS Free Tier alerts.
  - Choose PDF invoices.
- Go to budgets
  - Click create budget, then select the zero spend budget.

## Create account alias

- Go to your console dashboard and choose create account alias.  This is useful to have an easy to remember name for your account instead of the autogenerated name.

## Setup MFA

Let's secure our console access with MFA.

- Search for IAM in the text bar.  IAM is the AWS service where we create and manager users and their access keys.  We'll be spending a fair amount of time with it.
- Setup 2FA for your root user.  I used the Google Authenticator app.

## Create our Admin user

Let's create an Admin user that we'll use for the rest of the course.  For security puposes, after creating the Admin, we'll log out of the root user and not use it again.

- In IAM, choose users, then the add user button.

![add user](assets/IAM-add-admin-user.png)

- Add a username of Admin, provide access to the console, and choose create IAM user.  Create a custom password.  Since it's a user for us, we won't create a temporary password.

![admin permissions](assets/admin-permissions.png)

- Next, set the permissions. Choose attach policies directly, then search for admin and choose AdministratorAccess.  Push the + button to see the policy JSON, and you'll see it's as permissive as possible: this user can do everything to everything.
- Hit the next button.  No need to add tags, which are mainly used for tracking and classifying resources.  Hit create user.

## Login as Admin and add MFA

- Lot out of root and log in as the Admin user we just created.
- Add MFA for this user (under the Security Credentials tab).  Choose a different phone name (you can append -admin).

With that, our account is set up and we can start building our infrastructure!

# Register a domain

Go to [Route 53](https://us-east-1.console.aws.amazon.com/route53/v2/home#Dashboard), the AWS DNS service used for registering and managing domain names.

- Register a domain name for the course.  We're doing this first so that it has time to propagate by the time we need it.
- The cheapest ones seem to be about $12.
- I went with `jss.computer`, one of few sites with my initials available.

# Upload our frontend build directory to s3

AWS s3 is the basic service used for storing files.  We can use a s3 "bucket" to store our frontend assets and serve them up to the world.  The [free tier](https://aws.amazon.com/free) provides 5 gigs of storage.

s3 is a key/value store for names (file names) and "objects" (aka files).  They're stored in a flat hierarchy, though you can add directory paths to your file names if you want.

## Create a bucket for your site

- Click create bucket.

![create bucket](assets/create-bucket.png)

- Use your website's name for the bucket name.
- Turn off ACLs (default option).
- Unclick the Block all public access checkbox.  This will allow us to host our website directly from our bucket.  We'll turn this off later on in the course as our infrastructure gets more sophisticated.
- Keep all other default options, including disabling versioning, which we won't need for our purposes.

## Add a bucket policy allowing access

- Go to your bucket, then the Permissions tab, then click the edit button on the Bucket Policy.
- You can create a policy JSON document with the AWS [policy generator](https://awspolicygen.s3.amazonaws.com/policygen.html).
- Here, we want to let everyone access our bucket for now.
- Choose s3 Bucket policy from the dropdown
- Choose `*` for the principal, meanign we want the policy to apply to everyone.
- For actions, search for GetObject.
- For the ARN (Amazon Resource Name), copy the ARN from your bucket under the Properties tab.  ARNs are unique identifiers for cloud resrouces in AWS.  We'll be using them a lot.
- For the ARN, you need to add `/*` at the end, meaning all objects within the bucket.
- Your policy should look like this:
    ```json
    {
        "Id": "Policy1696532170133",
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "Stmt1696532167778",
                "Action": [
                    "s3:GetObject"
                ],
                "Effect": "Allow",
                "Resource": "arn:aws:s3:::jss.computer/*",
                "Principal": "*"
            }
        ]
    }
    ```

This is what AWS permission policy JSON docs look like.  They specify *who* can take an action (the principal), *what* actions they can perform, and *to which* resources.

- Copy this policy and paste it in to the bucket policy field.

## Upload our frontend assets

- Go to the Objects tab and click upload.
- Click add files, and upload everything from the `/out` directory.
  - If you choose upload entire directory instead, you'll have every file prefixed with the directory name.
- Click add folder and upload the `/_next` folder in `/out`.
- After uploading, click on the `index.html` object, then click the Object URL link (something like `https://s3.amazonaws.com/jss.computer/index.html`).  We're officially on the Internet!

## Enable Static Website Hosting

- We'll setup s3 to host our website.  In the bucket properties tab, scroll down to the bottom and edit the Static website hosting property.
- Click enable.

![enable static hosting](assets/enable-static-hosting.png)

- Choose `index.html` for the index document (go figure), and choose `404.html` as the error page.  `404.html` is the 404 page automatically generated by Next.
- Back in the bucket properties tab, go to the URL in the static website hosting section (should be something like `http://test-jss-computer.s3-website-us-east-1.amazonaws.com`).

Kick the tires a bit here.  You'll see that linking between our pages works.  But refreshing at `/foo` doesn't work, and we get the 404 page (we'll fix this).  Try going to a nonexistent page and you should correctly see the 404 page.

Cool!  We've got a website up, but there are a lot of improvements left.  We're on http instead of https, and our browser says our site isn't secure.  The url is pretty gross.  We had to manually upload the files. And the files are only hosted in one AWS region rather than globally.  Let's fix all that!

# Setup the AWS CLI

Let's take a minute to set up the AWS CLI.  It's useful for all kinds of things, like listing the resources in our account.  And when we get to using Pulumi, we'll need to have the AWS CLI configured locally so Pulumi can manage our infrastructure for us.

- Install the [AWS CLI](https://aws.amazon.com/cli/).
- Generate an access token for your admin user. IAM → User → Security Credentials → Create Access Key.
- Copy paste both public key and secret.  Keep them somewhere safe and secure.  You can only view these credentials once, so make sure.
- In your terminal, run `aws configure`.
  - Add your credentials.
  - Select us-east-1.
  - Select JSON for output.
- Give it a try!  Run this command with your bucket name to list the files in it. `aws s3 ls s3://jss.computer`.























