#!/bin/sh
# Собирает index.html для хостинга из src/page.html
{ printf '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat src/page.html; printf '\n</body></html>\n'; } > index.html
