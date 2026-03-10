import argparse
import json
import os

import requests


PROMPTS = {
    "brand-strategy": "Give three short brand positioning suggestions for a new consumer product.",
    "growth": "Give three short growth suggestions for a SaaS product.",
    "copywriting": "Write three short social post hooks for a product launch.",
}


def build_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Dify advisor regression checks against a deployed aimarketing environment.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("BASE_URL") or os.environ.get("TEST_BASE_URL"),
        required=not (os.environ.get("BASE_URL") or os.environ.get("TEST_BASE_URL")),
    )
    parser.add_argument(
        "--session-cookie",
        default=os.environ.get("TEST_DIFY_SESSION_COOKIE"),
        required=not os.environ.get("TEST_DIFY_SESSION_COOKIE"),
        help="Value of the aimarketing_session cookie for a user with Dify advisor config",
    )
    parser.add_argument(
        "--advisors",
        nargs="*",
        default=["brand-strategy", "growth", "copywriting"],
        choices=["brand-strategy", "growth", "copywriting"],
        help="Advisor types to test",
    )
    return parser.parse_args()


def main() -> None:
    args = build_args()
    base_url = args.base_url.rstrip("/")

    session = requests.Session()
    session.cookies.set("aimarketing_session", args.session_cookie, domain=base_url.replace("https://", "").replace("http://", ""), path="/")

    summary: dict[str, object] = {
        "availability": None,
        "results": [],
    }

    availability = session.get(f"{base_url}/api/dify/advisors/availability", timeout=60)
    availability_body = availability.json()
    summary["availability"] = {"status": availability.status_code, "body": availability_body}

    if availability.status_code != 200:
        print("DIFY_DEPLOYED_CHECK_START")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        print("DIFY_DEPLOYED_CHECK_END")
        raise SystemExit(1)

    for advisor in args.advisors:
        prompt = PROMPTS[advisor]
        chat = session.post(
            f"{base_url}/api/dify/chat-messages",
            json={
                "inputs": {"contents": prompt},
                "query": prompt,
                "response_mode": "blocking",
                "advisorType": advisor,
            },
            timeout=180,
        )
        chat_body = chat.json()
        conversation_id = chat_body.get("conversation_id")
        answer = str(chat_body.get("answer", "")).strip()

        delete_status = None
        delete_body: object = None
        if conversation_id:
            delete_res = session.delete(
                f"{base_url}/api/dify/conversations/{conversation_id}",
                json={"advisorType": advisor},
                timeout=60,
            )
            delete_status = delete_res.status_code
            try:
                delete_body = delete_res.json()
            except Exception:
                delete_body = {"raw": delete_res.text[:200]}

        summary["results"].append(
            {
                "advisorType": advisor,
                "chatStatus": chat.status_code,
                "conversationId": conversation_id,
                "answerPreview": answer[:200],
                "deleteStatus": delete_status,
                "deleteBody": delete_body,
            }
        )

    print("DIFY_DEPLOYED_CHECK_START")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("DIFY_DEPLOYED_CHECK_END")

    availability_data = availability_body.get("data", {})
    expected_flags = {
        "brand-strategy": availability_data.get("brandStrategy"),
        "growth": availability_data.get("growth"),
        "copywriting": availability_data.get("copywriting"),
    }
    for advisor in args.advisors:
        if expected_flags.get(advisor) is not True:
            raise SystemExit(1)

    for result in summary["results"]:
        if result["chatStatus"] != 200 or not result["conversationId"] or not result["answerPreview"]:
            raise SystemExit(1)
        if result["deleteStatus"] != 200:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
