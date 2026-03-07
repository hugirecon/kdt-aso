#!/usr/bin/env node
/**
 * Secure API Key Retrieval Script
 * Retrieves Anthropic API key from macOS Keychain instead of plaintext .env
 */

const { execSync } = require('child_process');

function getAnthropicApiKey() {
  try {
    // Try to get from keychain first
    const key = execSync('security find-generic-password -a "kdt-aso" -s "anthropic-api" -w 2>/dev/null', { encoding: 'utf8' }).trim();
    if (key && key.startsWith('sk-ant-api03-')) {
      return key;
    }
  } catch (e) {
    // Keychain entry doesn't exist
  }

  // Fallback to environment variable for development/docker
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  console.error('❌ CRITICAL: No Anthropic API key found!');
  console.error('Please store it in macOS Keychain:');
  console.error('security add-generic-password -a "kdt-aso" -s "anthropic-api" -w "your-api-key-here"');
  process.exit(1);
}

// Export for use in other modules
if (require.main === module) {
  console.log(getAnthropicApiKey());
} else {
  module.exports = { getAnthropicApiKey };
}