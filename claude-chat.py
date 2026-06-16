#!/usr/bin/env python3
"""
Simple Claude Terminal Chat
Chat with Claude directly from your terminal/PowerShell
"""

import anthropic
import os
from datetime import datetime

def main():
    # Get API key from environment variable
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set.")
        print("\nTo set it on Windows PowerShell:")
        print('$env:ANTHROPIC_API_KEY = "your-api-key-here"')
        print("\nGet your API key from: https://console.anthropic.com")
        return
    
    # Initialize the Anthropic client
    client = anthropic.Anthropic(api_key=api_key)
    
    print("=" * 60)
    print("Claude Terminal Chat")
    print("=" * 60)
    print("Type 'exit' or 'quit' to end the conversation")
    print("Type 'clear' to start a new conversation")
    print("=" * 60)
    print()
    
    # Conversation history for multi-turn conversations
    conversation_history = []
    
    while True:
        try:
            # Get user input
            user_input = input("You: ").strip()
            
            # Check for exit commands
            if user_input.lower() in ["exit", "quit"]:
                print("\nGoodbye!")
                break
            
            # Check for clear command
            if user_input.lower() == "clear":
                conversation_history = []
                print("\n[Conversation cleared]\n")
                continue
            
            # Skip empty inputs
            if not user_input:
                continue
            
            # Add user message to history
            conversation_history.append({
                "role": "user",
                "content": user_input
            })
            
            # Get response from Claude
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=1024,
                messages=conversation_history
            )
            
            # Extract the assistant's response
            assistant_message = response.content[0].text
            
            # Add assistant message to history
            conversation_history.append({
                "role": "assistant",
                "content": assistant_message
            })
            
            # Display the response
            print(f"\nClaude: {assistant_message}\n")
            
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except anthropic.APIError as e:
            print(f"\nAPI Error: {e}")
            print("Check that your API key is correct.\n")

if __name__ == "__main__":
    main()
