"""Utility to download an arbitrary URL and save its HTML.

Usage:
    python fetch_html.py <url> [output_file] [--no-verify]
"""
import argparse
import sys
import requests

def fetch_html(url: str, verify: bool = True) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    resp = requests.get(url, timeout=30, verify=verify, headers=headers)
    resp.raise_for_status()
    return resp.text


def main():
    parser = argparse.ArgumentParser(description="Fetch HTML of given URL")
    parser.add_argument("url", help="URL to download")
    parser.add_argument("output", nargs="?", help="file to write HTML into")
    parser.add_argument(
        "--no-verify",
        dest="verify",
        action="store_false",
        help="disable SSL certificate verification",
    )
    args = parser.parse_args()

    try:
        html = fetch_html(args.url, verify=args.verify)
    except Exception as e:
        print(f"Error fetching {args.url}: {e}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"HTML written to {args.output}")
    else:
        print(html)

if __name__ == "__main__":
    main()
