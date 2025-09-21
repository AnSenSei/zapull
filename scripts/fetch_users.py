#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import os
from google.cloud import firestore
import re
import json

# Set UTF-8 encoding for stdout
sys.stdout.reconfigure(encoding='utf-8')

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

try:
    db = firestore.Client()
except Exception as e:
    print(f"ERROR: Failed to init Firestore client: {e}")
    sys.exit(1)

seen = set()
users = []

for doc in db.collection("users").stream():
    data = doc.to_dict() or {}
    email = (data.get("email") or "").strip()
    display_name = (data.get("displayName") or "").strip()
    
    if email and EMAIL.match(email) and email not in seen:
        users.append({
            "email": email,
            "displayName": display_name or "User"
        })
        seen.add(email)

for user in users:
    print(f"{user['email']}|{user['displayName']}", flush=True)
