import express from "express";
import {MongoClient} from "mongodb";
import ActivitypubExpress from "activitypub-express";
import WebFinger from "webfinger.js";


class AccountNotFoundException extends Error {
}

export default class App {
    #DOMAIN;
    #PORT;
    #MONGODB_CONNECTION_STRING;
    #app;
    #mongoDb;
    #apex;
    #webfinger;
    #routes = {
        actor: '/u/:actor',
        object: '/o/:id',
        activity: '/s/:id',
        inbox: '/u/:actor/inbox',
        outbox: '/u/:actor/outbox',
        followers: '/u/:actor/followers',
        following: '/u/:actor/following',
        liked: '/u/:actor/liked',
        collections: '/u/:actor/c/:id',
        blocked: '/u/:actor/blocked',
        rejections: '/u/:actor/rejections',
        rejected: '/u/:actor/rejected',
        shares: '/s/:id/shares',
        likes: '/s/:id/likes'
    };

    #packageJson = process.env.npm_package_version;

    constructor() {
        this.#DOMAIN = process.env.DOMAIN || 'localhost';
        this.#PORT = process.env.PORT || '8080';
        this.#MONGODB_CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017/mastodon_autoboost';
        this.#webfinger = new WebFinger({
            webfistFallback: false,
            tlsOnly: true,
            uriFallback: false,
            requestTimeout: 10000,
        });
    }

    async run() {
        this.#app = express();

        this.#apex = ActivitypubExpress({
            name: this.#packageJson.name,
            version: this.#packageJson.version,
            domain: process.env.DOMAIN || 'localhost',
            actorParam: 'actor',
            objectParam: 'id',
            activityParam: 'id',
            routes: this.#routes,
            endpoints: {
                // proxyUrl: 'https://localhost/proxy'
            }
        });

        this.#mongoDb = new MongoClient(this.#MONGODB_CONNECTION_STRING);

        this.#app.use(
            express.json(({type: this.#apex.consts.jsonldTypes})),
            express.urlencoded({extended: true}),
            this.#apex
        );
        this.#app.use('/f', express.static('public/files'))

        this.#setupRoutes();
        this.#setupListeners();

        await this.#mongoDb.connect();

        this.#apex.store.db = this.#mongoDb.db();
        await this.#apex.store.setup();

        await this.#initSystemUser();

        this.#app.listen(this.#PORT, async () => {
            console.log(`Application running on port ${this.#PORT}`);

            await this.#followAccounts();
        })
    }

    #setupRoutes() {
        this.#app.route(this.#routes.inbox)
            .get(this.#apex.net.inbox.get)
            .post(this.#apex.net.inbox.post)
        this.#app.route(this.#routes.outbox)
            .get(this.#apex.net.outbox.get)
            .post(this.#apex.net.outbox.post)
        this.#app.get(this.#routes.actor, this.#apex.net.actor.get)
        this.#app.get(this.#routes.followers, this.#apex.net.followers.get)
        this.#app.get(this.#routes.following, this.#apex.net.following.get)
        this.#app.get(this.#routes.liked, this.#apex.net.liked.get)
        this.#app.get(this.#routes.object, this.#apex.net.object.get)
        this.#app.get(this.#routes.activity, this.#apex.net.activityStream.get)
        this.#app.get(this.#routes.shares, this.#apex.net.shares.get)
        this.#app.get(this.#routes.likes, this.#apex.net.likes.get)
        this.#app.get('/.well-known/webfinger', this.#apex.net.webfinger.get)
        this.#app.get('/.well-known/nodeinfo', this.#apex.net.nodeInfoLocation.get)
        this.#app.get('/nodeinfo/:version', this.#apex.net.nodeInfo.get)
        this.#app.post('/proxy', this.#apex.net.proxy.post)
    }

    #setupListeners() {
        this.#app.on('apex-outbox', msg => {
            if (msg.activity.type === 'Create') {
                console.log(`New ${msg.object.type} from ${msg.actor}`);
            }
        });

        this.#app.on('apex-inbox', msg => {
            switch (msg.activity.type.toLowerCase()) {
                case 'create':
                    this.#onCreate(msg);
            }
            if (msg.activity.type === 'Create') {
                console.log(`New ${msg.object.type} from ${msg.actor} to ${msg.recipient}`)
            }
        })
    }

    async #initSystemUser() {
        this.#apex.systemUser = await this.#apex.store.getObject(this.#apex.utils.usernameToIRI('system_service'), true);
        if (!this.#apex.systemUser) {
            const icon = {
                type: 'Image',
                mediaType: 'image/jpeg',
                url: `https://${this.#DOMAIN}/f/guppe.png`
            }
            const systemUser = await this.#apex.createActor(
                'system_service',
                `${this.#DOMAIN} system service`,
                `${this.#DOMAIN} system service`,
                icon,
                'Service');
            await this.#apex.store.saveObject(systemUser);
            this.#apex.systemUser = systemUser;
        }

    }

    async #followAccounts() {
        const accounts = [
            'testa@noitl.space'
        ];

        for (const account of accounts) {
            try {
                const id = await this.#getUserIdFromAccountName(account);
                const followActivity = await this.#apex.buildActivity('Follow', this.#apex.systemUser, id);
                console.log(followActivity);
                console.log(await this.#apex.addToOutbox(this.#apex.systemUser, followActivity));
            } catch (e) {
                console.error(e);
            }
        }

    }

    #getUserIdFromAccountName(accountName) {
        return new Promise((resolve, reject) => {
            this.#webfinger.lookup(accountName, (err, webfingerData) => {
                if (err) {
                    throw new AccountNotFoundException(err);
                }

                const links = webfingerData.object.links.filter(link => link.rel === 'self');
                if (links.length === 0) {
                    reject("Webfinger response does not contain \"self\" link");
                }

                resolve(links[0].href);
            });
        })

    }

    #onCreate(msg) {
        console.log('msg created');
        const audience = this.#apex.audienceFromActivity(msg.activity);
        console.log(audience);
        // TODO: Boost content with accounts that have configured it via Mastodon api
    }
}