import * as fs from 'fs';

(async () => {
    const configs = [
        {
            network: 'mainnet',
            url: 'https://fullnode.mainnet.aptoslabs.com/v1/spec.json',
        },
        {
            network: 'testnet',
            url: 'https://fullnode.testnet.aptoslabs.com/v1/spec.json',
        },
        {
            network: 'devnet',
            url: 'https://fullnode.devnet.aptoslabs.com/v1/spec.json',
        },
    ];

    const network = process.argv[2];
    const config = configs.find((c) => c.network === network) ?? configs[0];
    const response = await fetch(config.url);
    const json = await response.json();

    fs.writeFileSync(`./src/spec.json`, JSON.stringify(json), 'utf8');
})();
