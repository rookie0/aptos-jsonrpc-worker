import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { AptosAccount, AptosClient, FaucetClient, HexString, TransactionBuilderEd25519 } from 'aptos';
import { find } from 'lodash';

describe('Worker', () => {
    let worker: UnstableDevWorker;

    beforeAll(async () => {
        worker = await unstable_dev('src/index.ts', {
            experimental: { disableExperimentalWarning: true },
        });
    });

    afterAll(async () => {
        await worker.stop();
    });

    it('should return error', async () => {
        let resp = await worker.fetch();
        expect(resp.status).toBe(404);

        resp = await worker.fetch('/foo', {
            method: 'POST',
        });
        expect(resp.status).toBe(404);

        resp = await worker.fetch('', {
            method: 'POST',
        });
        let res = await resp.json();
        expect(res).toMatchObject({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } });
    });

    it('should return data', async () => {
        // general
        let resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'get_ledger_info',
                params: [],
            }),
        });
        let res: any = await resp.json();
        expect(!!res.result).toBeTruthy();

        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'healthy',
                params: [],
            }),
        });
        res = await resp.json();
        expect(!!res.result).toBeTruthy();

        // accounts
        const address = '0x000000616a48469384a03540e9b391d9753c1e2cde382d058a58975585fca596';
        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'getAccount',
                params: [address],
            }),
        });
        res = await resp.json();
        expect(!!res.result).toBeTruthy();

        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'apt_getAccountResources',
                params: [address, {}, '764000'],
            }),
        });
        res = await resp.json();
        expect(!!res.error).toBeTruthy();

        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'apt_getAccountResources',
                params: [address, { limit: 1 }],
            }),
        });
        res = await resp.json();
        expect(!!res.result).toBeTruthy();

        // transactions
        const nodeUrl = 'https://fullnode.devnet.aptoslabs.com';
        const faucetUrl = 'https://faucet.devnet.aptoslabs.com';
        const client = new AptosClient(nodeUrl);
        const faucetClient = new FaucetClient(nodeUrl, faucetUrl);
        const account = new AptosAccount();
        await faucetClient.fundAccount(account.address().hex(), 100_000_000);

        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'apt_getAccountResources',
                params: [account.address().hex()],
            }),
        });
        res = await resp.json();
        expect(!!res.result).toBeTruthy();
        expect(find(res.result, { type: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>' }).data.coin.value).toBe('100000000');

        const payload = {
            function: '0x1::coin::transfer',
            type_arguments: ['0x1::aptos_coin::AptosCoin'],
            arguments: [address, '88888888'],
        };
        let txn = await client.generateTransaction(account.address().hex(), payload);
        const signature = account.signBuffer(TransactionBuilderEd25519.getSigningMessage(txn));

        // submit json format transaction
        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'submit_transaction',
                params: [
                    {
                        sender: account.address().hex(),
                        sequence_number: txn.sequence_number.toString(),
                        max_gas_amount: txn.max_gas_amount.toString(),
                        gas_unit_price: txn.gas_unit_price.toString(),
                        expiration_timestamp_secs: txn.expiration_timestamp_secs.toString(),
                        payload: {
                            type: 'entry_function_payload',
                            ...payload,
                        },
                        signature: {
                            type: 'ed25519_signature',
                            public_key: account.pubKey().hex(),
                            signature: signature.hex(),
                        },
                    },
                ],
            }),
        });
        res = await resp.json();
        expect(!!res.result).toBeTruthy();

        // submit bcs format transaction
        await faucetClient.fundAccount(account.address().hex(), 100_000_000);
        txn = await client.generateTransaction(account.address().hex(), payload);
        const signedTxn = await AptosClient.generateBCSTransaction(account, txn);
        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'submit_transaction',
                params: [HexString.fromBuffer(signedTxn).hex()],
            }),
        });
        res = await resp.json();
        expect(!!res.result).toBeTruthy();
        const hash = res.result.hash;

        await new Promise((r) => setTimeout(r, 3000));
        resp = await worker.fetch('', {
            method: 'POST',
            body: JSON.stringify({
                method: 'get_transaction_by_hash',
                params: [hash],
            }),
        });
        res = await resp.json();
        expect(!!res.result).toBeTruthy();
        console.log(res);
    }, 60000);
});
