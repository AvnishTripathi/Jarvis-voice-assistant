"""
main.py
CLI entrypoint to test the Autonomous Self-Healing Jarvis Engine.
"""

import os
from dotenv import load_dotenv

# Automatically load environment variables from .env file
load_dotenv()

from core.engine import JarvisEngine


def main():
    print("=" * 70)
    print("JARVIS Autonomous Production Engine [Google GenAI + Self-Healing Loop]")
    print("Subsystems: Shell Execution, Live Telemetry, Screen/Webcam Ingestion")
    print("Type 'exit' to terminate.")
    print("=" * 70)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\n[NOTICE] GEMINI_API_KEY not detected in current environment.")
        try:
            entered = input("Enter GEMINI_API_KEY (or press Enter to run diagnostic mode): ").strip()
            if entered:
                api_key = entered
                os.environ["GEMINI_API_KEY"] = api_key
                try:
                    with open(".env", "a", encoding="utf-8") as env_f:
                        env_f.write(f"\nGEMINI_API_KEY={api_key}\n")
                    print(" [SAVED] GEMINI_API_KEY saved to .env file! You will not be asked again.")
                except Exception:
                    pass
        except (KeyboardInterrupt, EOFError):
            print("\nJARVIS: Subsystems deactivated.")
            return

    model_choice = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    jarvis = JarvisEngine(model_name=model_choice, api_key=api_key or None)

    while True:
        try:
            user_input = input("\nMaster > ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit"]:
                print("JARVIS: Subsystems deactivated.")
                break

            response = jarvis.execute_instruction(user_input)
            print(f"\nJARVIS >\n{response}")

        except (KeyboardInterrupt, EOFError):
            print("\nJARVIS: Manual interrupt received. Exiting.")
            break


if __name__ == "__main__":
    main()
