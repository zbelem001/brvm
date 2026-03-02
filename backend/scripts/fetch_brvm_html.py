"""Simple script that downloads the HTML of https://www.brvm.org/.

Usage:
    python fetch_brvm_html.py [output_file]
    python fetch_brvm_html.py [output_file] --no-verify

If an output file is provided the HTML is written there, otherwise printed to stdout.

The `--no-verify` switch disables SSL certificate validation; useful if
your Python installation lacks up‑to‑date CA bundles (causes CERTIFICATE_VERIFY_FAILED).
"""
import sys
import argparse
import requests

URL = "https://www.brvm.org/"


def fetch_html(url: str, verify_ssl: bool = True) -> str:
    # optionally disable TLS cert validation to avoid local CA issues
    resp = requests.get(url, timeout=30, verify=verify_ssl)
    resp.raise_for_status()
    return resp.text


def main():
    parser = argparse.ArgumentParser(description="Download BRVM homepage HTML")
    parser.add_argument("output", nargs="?", help="file to write HTML into")
    parser.add_argument(
        "--no-verify",
        dest="verify",
        action="store_false",
        help="disable SSL certificate verification",
    )
    args = parser.parse_args()

    try:
        html = fetch_html(URL, verify_ssl=args.verify)
    except Exception as e:
        print(f"Error fetching {URL}: {e}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"HTML written to {args.output}")
    else:
        print(html)


if __name__ == "__main__":
    main()
