from google.cloud import firestore

db = firestore.Client()

wrong = "https://avatar.zapull.fun/"
right = "https://avator.zapull.fun/"

batch = db.batch()
count = 0
for doc in db.collection("users").stream():
    data = doc.to_dict() or {}
    avatar = data.get("avatar")
    if isinstance(avatar, str) and avatar.startswith(wrong):
        fixed = right + avatar[len(wrong):]
        batch.update(doc.reference, {"avatar": fixed})
        count += 1
        # Commit every 400 updates (Firestore batch limit is 500)
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()

# Commit remaining updates
batch.commit()
print(f"Fixed {count} user avatar URLs")