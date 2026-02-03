# Milo Github Actions Trigger – Adobe I/O Runtime Project

This repository is the Adobe I/O Runtime project for the **Project: Milo Github Actions Trigger**.

## Prerequisites & Setup

- **Node.js 22 required!** Please ensure you are running Node 22 before development or deployment.
- The `.env` file for environment configuration is managed securely—retrieve the correct file from Vault under `milo-github-actions-trigger`. Do **not** commit secrets or sensitive configs to source control.

## Important Considerations

Since this project acts as a trigger for scheduled jobs from within Github, you _must_ ensure that jobs do not run concurrently or accidentally from multiple application environments (such as development and production) at the same time. This helps prevent duplicate runs and race conditions in downstream processing.

### GITHUB_EVENTS

The `GITHUB_EVENTS` environment variable defines which event(s) in Github will trigger the indexer workflow. It is configured via the `.env` file. Be sure that it is set correctly to control when the trigger fires. Only indexers relevant to the defined event(s) will be invoked.

## Schedule & Logic Summary

The Milo Github Actions Trigger is scheduled to run on a predetermined interval (such as every few minutes, as defined in Adobe I/O's schedule settings). On invocation, it assesses the latest event types specified in `GITHUB_EVENTS` and determines if an indexing workflow needs to be kicked off for the Milo project repositories. The logic ensures that only one instance processes events at a time (by design and via precautions mentioned above), dispatches to the correct indexer, and does not re-trigger unless a new relevant event has occurred. This reliable orchestration is key for maintaining consistent and timely Github-triggered automation for Milo.
