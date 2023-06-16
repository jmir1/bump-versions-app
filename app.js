import dotenv from 'dotenv'
import fs from 'fs'
import http from 'http'
import { App } from 'octokit'
import { createNodeMiddleware } from '@octokit/webhooks'

// Load environment variables from .env file
dotenv.config()

// Set configured values
const appId = process.env.APP_ID
const privateKeyPath = process.env.PRIVATE_KEY_PATH
const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
const secret = process.env.WEBHOOK_SECRET

// Create an authenticated Octokit client authenticated as a GitHub App
const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret
  }
})

// Optional: Get & log the authenticated app's name
const { data } = await app.octokit.request('/app')

// Read more about custom logging: https://github.com/octokit/core.js#logging
app.octokit.log.debug(`Authenticated as '${data.name}'`)

// Subscribe to the "pull_request.opened" webhook event
app.webhooks.on('push', async ({ octokit, payload }) => {
  console.log(`Received a push event for ${payload.ref}`)
  try {
    if (payload.ref === 'refs/heads/mass-bump-versions' &&
      payload.deleted === false) {
      console.log('Create PR')
      const newPr = await octokit.rest.pulls.create({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        title: '[skip ci] chore: Mass bump on extensions',
        head: 'mass-bump-versions',
        base: 'master'
      })
      console.log('Merge PR')
      await octokit.rest.pulls.merge({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: newPr.data.number,
        merge_method: 'squash',
        commit_title: '[skip ci] chore: Mass bump on extensions',
        commit_message: ''
      })
      console.log('Delete branch')
      await octokit.rest.git.deleteRef({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        ref: 'heads/mass-bump-versions'
      })
    }
  } catch (error) {
    if (error.response) {
      console.error(`Error! Status: ${error.response.status}. Message: ${error.response.data.message}`)
    } else {
      console.error(error)
    }
  }
})

// Optional: Handle errors
app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    // Log Secret verification errors
    console.log(`Error processing request: ${error.event}`)
  } else {
    console.log(error)
  }
})

// Launch a web server to listen for GitHub webhooks
const port = process.env.PORT || 3000
const path = '/api/webhook'
const localWebhookUrl = `http://localhost:${port}${path}`

// See https://github.com/octokit/webhooks.js/#createnodemiddleware for all options
const middleware = createNodeMiddleware(app.webhooks, { path })

http.createServer(middleware).listen(port, () => {
  console.log(`Server is listening for events at: ${localWebhookUrl}`)
  console.log('Press Ctrl + C to quit.')
})
