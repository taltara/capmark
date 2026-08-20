#!/usr/bin/env node
import { main } from './cli.ts'

process.exit(main(process.argv.slice(2)))
