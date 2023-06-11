# Aptos JSON-RPC Worker

Aptos JSON-RPC API Service on [Cloudflare Workers](https://www.cloudflare.com/products/workers/).

Aptos Node provides a [REST API](https://aptos.dev/nodes/aptos-api-spec#/) for client applications to query the Aptos blockchain.

But most blockchains use JSON-RPC for the clients to interact with the nodes.

So here provider an option for developers who prefer to use the JSON-RPC to interact with Aptos. 

## Deploy

- Just click the button and follow the steps

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rookie0/aptos-jsonrpc-worker)

- Use [Wrangler](https://developers.cloudflare.com/workers/wrangler/)

Clone this repository and run `wrangler deploy` in the directory, make sure wrangler installed and login first

## Usage

- Init Aptos API Spec `npx ts-node ./src/init.ts [mainnet | testnet | devnet]`

- Change `network` config in [index.ts](./src/index.ts#L35)

- Run at local `npm run start`

Now you can start your request:

- JSON-RPC method name is the REST API spec operation id, and support three formats like: `get_ledger_info`, `getLedgerInfo`, `apt_getLedgerInfo`

- JSON-RPC params transform follow these principles:
  1. parameters in path are required as the first elements of params array
  2. request body is the next element of params array if present in spec
  3. parameters in query except ledger_version are the next element of params array, the element type is object if query parameters more than one
  4. parameter ledger_version in query are the last element of params array if present in spec which is optional
  5. support content-type application/x.aptos.signed_transaction+bcs request by use hex string in the params

- See examples in [test](./src/index.test.ts)

  ```shell
  curl --request POST \
    --url https://aptos-jsonrpc.dev2pub.workers.dev/ \
    --header 'user-agent: vscode-restclient' \
    --data '{"jsonrpc": "2.0","id": 0,"method": "get_ledger_info","params": []}'
  ```

  ```json
  {
      "jsonrpc": "2.0",
      "id": 0,
      "result": {
          "chain_id": 61,
          "epoch": "21",
          "ledger_version": "1010908",
          "oldest_ledger_version": "0",
          "ledger_timestamp": "1686412427415641",
          "node_role": "full_node",
          "oldest_block_height": "0",
          "block_height": "487996",
          "git_hash": "b03517fe92a5695d774e12d864d94b40f8194c89"
      },
      "blockHeight": "487996",
      "chainId": "61",
      "epoch": "21",
      "ledgerOldestVersion": "0",
      "ledgerTimestampusec": "1686412427415641",
      "ledgerVersion": "1010908",
      "oldestBlockHeight": "0"
  }
  ```

## License

[MIT](./LICENSE)
