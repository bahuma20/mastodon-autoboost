# Mastodon Autoboost

Automatically boost posts from fediverse users with your mastodon account.

## Environment variable

- `DOMAIN`: The domain where the application is deployed at. (Example: autoboost.social)
- `PORT`: The port that the application should run (Default: 8080)
- `MONGODB_CONNECTION_STRING`: URL and authentication to mongodb (Example: mongodb://user:password@localhost:27017/mastodon_autoboost?authSource=admin)
- `BASE_URL`: The publicly accessible URL of the application (Example: https://autoboost.social)
- `MASTODON_CLIENT_ID`: Mastodon Client ID
- `MASTODON_CLIENT_SECRET`: Mastodon Client Secret
- `SECRET`: A secret that is used for sessions, passwords and co...
- `FOLLOW_ACCOUNTS`: Which accounts to follow. Separated by comma. (Example: "@bahuma20@noitl.space,@bahuma20@pixelfed.de,@bahuma20@theunseen.city")