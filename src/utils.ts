import { BlockTag } from "ethers";
import { actor, blockchainClient } from "./config";
import { GetEvmStrategy } from "./declarations/backend.did";
import { QueryResponse } from "./models";

export const parseJsonToModel = <T>(query: QueryResponse): T => {
    return JSON.parse(query.Ok) as T;
}

export async function getVotingPower(voterAddress: string, spaceId: number, blockHeight: bigint | string): Promise<bigint> {
    const res = await actor.get_all_evm_strategies_by_space_id({ id: spaceId }) as QueryResponse;
    const strategies = parseJsonToModel<GetEvmStrategy[]>(res);

    let power = 0n;

    console.log(strategies);

    for (const strategy of strategies) {
        power += await callStrategy(voterAddress, strategy, blockHeight);
    }

    return power;
}

export async function callStrategy(voterAddress: string, strategy: GetEvmStrategy, blockHeight: BigInt | string = "latest"): Promise<bigint> {
    const result = await blockchainClient.call({
        chainId: strategy.chainId,
        to: strategy.contractAddress,
        blockTag: blockHeight as BlockTag,
        data: strategy.configString.replace("$voterAddress", voterAddress.replace("0x", ""))
    })

    return BigInt(result);
}

export async function triggerEvent(spaceId: number, eventType: number, eventData: object) {
    // const events = actor.get_events_by_space_id({ id: spaceId, eventType: eventType });

    // for (const event of events) {
    //     fetch(event.url, {
    //         method: "POST",
    //         headers: {
    //             "Content-Type": "application/json"
    //         },
    //         body: event.
    //     });
    // }


}