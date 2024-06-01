import { ethers } from 'ethers';
import express, { Request } from 'express';
import { VoteData } from '../models';
import { ProposalOptionVote } from '../declarations/backend.did';
import { getVotingPower } from '../utils';
import { actor } from '../config';

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
    res.json("{ message: 'Ahoj pepo' }");
});

app.post("/api/vote", async (req: Request<{}, {}, VoteData>, res) => {
    const messageHash = ethers.hashMessage(JSON.stringify(req.body.message));
    const publicKey = ethers.recoverAddress(messageHash, req.body.signature).toLowerCase();

    console.log("Public key: ", publicKey);

    if (publicKey !== req.body.message.voterAddress) {
        res.status(400).json({ message: "Address verification failed" });
        return;
    }

    const isEthAddress = req.body.message.voterAddress.startsWith("0x");

    if (!isEthAddress) {
        res.status(400).json({ message: "jebat btc 🤠" });
        return;
    }

    let blockHeight: bigint | string = "latest";

    if (req.body.message.blockHeight) {
        blockHeight = BigInt(req.body.message.blockHeight);
    }

    const power = await getVotingPower(req.body.message.voterAddress, req.body.message.spaceId, blockHeight);

    console.log("Voting power: ", power);

    if (power <= 0n) {
        res.status(400).json({ message: "Not enough voting power" });
        return;
    }

    const newVote: ProposalOptionVote = {
        id: 0,
        signature: req.body.signature,
        optionId: req.body.message.proposalOptionId,
        voteType: 0,
        votingPower: power,
        userAddress: publicKey,
        timestamp: Date.now()
    }

    await actor.insert_proposal_option_vote(newVote);

    res.json({ message: publicKey === req.body.message.voterAddress ? "Success" : "Failed" });
});

app.get("/api/power", async (req: Request<{}, {}, {}>, res) => {
    let voterAddress = req.query.voterAddress as string;
    let spaceId = +(req.query.spaceId as string);
    let blockHeight = req.query.blockHeight as string ?? "latest";

    let power = await getVotingPower(voterAddress, spaceId, blockHeight);
    res.json({ votingPower: power.toString() });
});

// app.post()

const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

