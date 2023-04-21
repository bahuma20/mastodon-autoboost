import passport from "passport";
import OAuth2Strategy from "passport-oauth2";
import session from "express-session";
import expressMongodbSession from "express-mongodb-session";

export default class Mastodon {
    #MASTODON_CLIENT_ID;
    #MASTODON_CLIENT_SECRET;
    #MASTODON_SERVER;
    #SECRET;
    #BASE_URL;
    #MONGODB_CONNECTION_STRING;

    #app;
    #db;


    constructor(app, db) {
        this.#db = db;
        this.#app = app;

        this.#MASTODON_CLIENT_ID = process.env.MASTODON_CLIENT_ID;
        if (!this.#MASTODON_CLIENT_ID) throw new Error('Missing environment variable MASTODON_CLIENT_ID');

        this.#MASTODON_CLIENT_SECRET = process.env.MASTODON_CLIENT_SECRET;
        if (!this.#MASTODON_CLIENT_SECRET) throw new Error('Missing environment variable MASTODON_CLIENT_SECRET');

        this.#MASTODON_SERVER = process.env.MASTODON_SERVER;
        if (!this.#MASTODON_SERVER) throw new Error('Missing environment variable MASTODON_SERVER');

        this.#BASE_URL = process.env.BASE_URL;
        if (!this.#BASE_URL) throw new Error('Missing environment variable BASE_URL');

        this.#SECRET = process.env.SECRET;
        if (!this.#SECRET) throw new Error('Missing environment variable SECRET');

        this.#MONGODB_CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING;
        if (!this.#MONGODB_CONNECTION_STRING) throw new Error('Missing environment variable MONGODB_CONNECTION_STRING');

        const MongoDBStore = expressMongodbSession(session);
        const store = new MongoDBStore({
            uri: this.#MONGODB_CONNECTION_STRING,
            collection: 'mastodonSessions'
        });

        store.on('error', error => {
            console.error(error);
        });

        this.#app.use(session({
            secret: this.#SECRET,
            resave: false,
            saveUninitialized: false,
            store: store
        }));
        app.use(passport.authenticate('session'));

        this.#setupPassport();
        this.#setupRoutes();
    }

    #setupRoutes() {
        this.#app.get('/login', passport.authenticate('mastodon'));
        this.#app.get('/auth/mastodon/callback',
            passport.authenticate('mastodon', {failureRedirect: '/login-error'}),
            (req, res) => {
                res.redirect('/login-success')
            }
        );
        this.#app.get('/login-success', (req, res) => {
            console.log(req.user);
            res.send(JSON.stringify(req.user));
        });
        this.#app.get('/login-error', (req, res) => {
            res.send('ERROR');
        })
    }

    #setupPassport() {
        passport.serializeUser((user, done) => {
            done(null, user);
        });

        passport.deserializeUser(function(user, done) {
            done(null, user);
        });

        passport.use('mastodon',
            new OAuth2Strategy({
                    authorizationURL: `${this.#MASTODON_SERVER}/oauth/authorize`,
                    tokenURL: `${this.#MASTODON_SERVER}/oauth/token`,
                    clientID: this.#MASTODON_CLIENT_ID,
                    clientSecret: this.#MASTODON_CLIENT_SECRET,
                    callbackURL: `${this.#BASE_URL}/auth/mastodon/callback`,
                    scope: 'read:search write:statuses'
                },
                (accessToken, refreshToken, profile, cb) => {
                    console.log('Auth callback');
                    console.log(accessToken, refreshToken, profile, cb);
                    this.#storeAccessToken(accessToken).then(() => console.log('Access token stored in DB'));
                    return cb(null, accessToken);
                })
        );
    }

    async #storeAccessToken(accessToken) {
        const mastodonUsers = this.#db.collection('mastodonUsers');

        const users = await mastodonUsers.find();

        await mastodonUsers.deleteMany(users);

        const doc = {
            accessToken: accessToken,
        };

        await mastodonUsers.insertOne(doc);
    }

    async #getAccessToken() {
        const mastodonUsers = this.#db.collection('mastodonUsers');

        const user = await mastodonUsers.findOne();

        return user.accessToken;
    }

    async boost(id) {
        const statusId = await this.#getStatusIdByUrl(id);
        await this.#boostStatus(statusId);

        console.log(statusId);
    }

    async #getStatusIdByUrl(statusUrl) {
        const accessToken = await this.#getAccessToken();

        const url = new URL(this.#MASTODON_SERVER);
        url.pathname = 'api/v2/search';
        url.searchParams.append('q', statusUrl)
        url.searchParams.append('type', 'statuses')
        url.searchParams.append('resolve', 'true')

        const response = await fetch(url.href, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const searchResults = await response.json();

        if (searchResults.statuses.length === 0) {
            throw new Error('Status could not be found');
        }

        return searchResults.statuses[0].id;
    }

    async #boostStatus(id) {
        const accessToken = await this.#getAccessToken();

        const url = new URL(this.#MASTODON_SERVER);
        url.pathname = `api/v1/statuses/${id}/reblog`;

        const response = await fetch(url.href, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const result = await response.json();

        console.log(result);
    }
}