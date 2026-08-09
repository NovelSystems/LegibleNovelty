# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability in this repository, report it privately. Don't open a public issue.

Email: sam@novelsystems.me

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof of concept if you have one
- The affected file, endpoint, or component, if known

## What to expect

- Acknowledgment within 5 business days
- A severity assessment and rough timeline for a fix, once confirmed
- Credit in the fix commit or release notes, if you want it, once the issue is resolved

## Scope

This covers the Legible Novelty web application and its source code in this repository: authentication, data handling, API endpoints, and infrastructure configuration.

Out of scope:
- Social engineering
- Physical security
- Denial-of-service testing against the live deployment
- Vulnerabilities in third-party dependencies (report those upstream; Dependabot tracks known CVEs in this repo)

## Supported versions

This project doesn't follow semantic versioning for security purposes. The `main` branch is the only supported version.

## Good faith

Security research conducted in good faith, without accessing or modifying other users' data beyond what's needed to demonstrate the issue, won't result in legal action.
