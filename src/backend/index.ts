import { ethers } from "ethers";
import express, { Request } from "express";
import { encodeTransaction } from "../utils";
import { backendActor, evmActor } from "../config";
import { Canister, blob, ic, serialize, update } from "azle";
import { managementCanister } from "azle/canisters/management";
import { EventData, InsertSpace, QueryResponse, VoteData } from "../models";
import {
  GetBtcStrategy,
  GetEvmStrategy,
  InsertProposal,
  InsertProposalOption,
  InsertProposalOptionVote,
  Proposal,
  ProposalOption,
  ProposalOptionVote,
  Space,
  SpaceEvent,
} from "../declarations/backend/backend.did";
import { getVotingPower, parseJsonToModel, triggerEvent } from "../utils";
import cors from "cors";

const app = express();

app.use(cors());

app.use(express.json());

app.get("/", (_req, res) => {
  res.json("{ message: 'Ahoj pepo' }");
});

app.post("/api/event", async (req: Request<{}, {}, EventData>, res) => {
  const query = (await backendActor.insert_space_event({
    id: 0,
    eventtype: req.body.eventType,
    spaceId: req.body.spaceId,
    payload: req.body.payload,
    webhookUrl: req.body.webhookUrl,
  })) as QueryResponse;

  if (query.Ok) {
    res.json({ message: "JJ" });
  }
  res.json({ message: "NE", error: query });
});

app.post("/api/proposal", async (req: Request<{}, {}, InsertProposal>, res) => {
  const query = (await backendActor.insert_proposal({
    ...req.body,
    dateCreated: Math.floor(Date.now() / 1000),
  })) as QueryResponse;
  if (query.Ok) {
    const proposals = await backendActor.query_proposals_by_space_id({
      id: req.body.spaceId,
    });
    const parsed = JSON.parse((proposals as any).Ok);
    const max = parsed.reduce((acc: number, curr: Proposal) => {
      return curr.id > acc ? curr.id : acc;
    }, 0);

    return res.json({ proposalId: max });
  }
  res.json({ message: "NE", error: query });
});

app.post(
  "/api/proposal/option",
  async (req: Request<{}, {}, InsertProposalOption>, res) => {
    const query = (await backendActor.insert_proposal_option(
      req.body
    )) as QueryResponse;
    if (query.Ok) {
      return res.json({ message: "JJ" });
    }
    res.json({ message: "NE", error: query });
  }
);

app.post("/api/space", async (req: Request<{}, {}, InsertSpace>, res) => {
  const query = (await backendActor.insert_space({
    id: 0,
    websiteLink: req.body.websiteLink,
    name: req.body.name,
    minVoteRole: req.body.minVoteRole,
    iconLink: req.body.iconLink,
    voteDuration: req.body.voteDuration,
    voteDelay: req.body.voteDelay,
    minVotePower: req.body.minVotePower,
    quorum: req.body.quorum,
  })) as QueryResponse;

  if (query.Ok) {
    res.json({ message: "JJ" });
  }
  res.json({ message: "NE", error: query });
});

app.post("/api/vote", async (req: Request<{}, {}, VoteData>, res) => {
  console.log(req.body);

  const messageHash = ethers.hashMessage(JSON.stringify(req.body.message));
  const publicKey = ethers
    .recoverAddress(messageHash, req.body.signature)
    .toLowerCase();

  console.log("Public key: ", publicKey);
  console.log("Voter address: ", req.body.message.address);

  if (publicKey !== req.body.message.address.toLowerCase()) {
    res.status(400).json({ message: "Address verification failed" });
    return;
  }

  const isEthAddress = req.body.message.address.startsWith("0x");

  if (!isEthAddress) {
    res.status(400).json({ message: "Bitcoin is not supported yet" });
    return;
  }

  let blockHeight: bigint | string = "latest";

  if (req.body.message.blockHeight) {
    blockHeight = BigInt(req.body.message.blockHeight);
  }

  let power = await getVotingPower(
    req.body.message.address,
    req.body.message.spaceId,
    blockHeight
  );

  console.log("Voting power: ", power);

  power = 3n;

  if (power <= 0n) {
    res.status(400).json({ message: "Not enough voting power" });
    return;
  }

  await triggerEvent(req.body.message.spaceId, 0, {
    power: power.toString(),
    address: req.body.message.address,
  });

  const newVote: InsertProposalOptionVote = {
    signature: req.body.signature,
    optionId: req.body.message.optionId,
    voteType: 0,
    votingPower: power,
    userAddress: publicKey,
    timestamp: Math.floor(Date.now() / 1000),
  };

  await backendActor.insert_proposal_option_vote(newVote);

  res.json({
    message: publicKey === req.body.message.address ? "Success" : "Failed",
  });
});

app.get("/api/power", async (req: Request<{}, {}, {}>, res) => {
  let address = req.query.address as string;
  let spaceId = +(req.query.spaceId as string);
  let blockHeight = (req.query.blockHeight as string) ?? "latest";

  let power = await getVotingPower(address, spaceId, blockHeight);
  res.json({ votingPower: power.toString() });
});

app.get("/api/spaces", async (req: Request<{}, {}, {}>, res) => {
  const query = (await backendActor.query_all_spaces({
    limit: 99999,
    offset: 0,
  })) as QueryResponse;

  const spaces = parseJsonToModel<Space[]>(query);

  res.json(spaces);
});

app.get("/api/spaces/:id", async (req, res) => {
  const id = req.params.id;
  const query = (await backendActor.query_spaces_by_id({
    id: +id,
  })) as QueryResponse;

  const spaces = parseJsonToModel<Space>(query);

  res.json(spaces);
});

app.get("/api/spaces/:id/proposals", async (req, res) => {
  const id = req.params.id;
  const query = (await backendActor.query_proposals_by_space_id({
    id: +id,
  })) as QueryResponse;

  const spaces = parseJsonToModel<Proposal[]>(query);

  res.json(spaces);
});

app.get("/api/spaces/:id/events", async (req, res) => {
  const id = req.params.id;
  const query = (await backendActor.get_all_space_events_by_space_id({
    id: +id,
  })) as QueryResponse;

  const events = parseJsonToModel<SpaceEvent[]>(query);

  res.json(events);
});

app.get("/api/spaces/:id/evm", async (req, res) => {
  const id = req.params.id;
  const query = (await backendActor.get_all_evm_strategies_by_space_id({
    id: +id,
  })) as QueryResponse;

  const events = parseJsonToModel<GetEvmStrategy[]>(query);

  res.json(events);
});

app.get("/api/spaces/:id/btc", async (req, res) => {
  const id = req.params.id;
  const query = (await backendActor.get_all_btc_strategies_by_space_id({
    id: +id,
  })) as QueryResponse;

  const events = parseJsonToModel<GetBtcStrategy[]>(query);

  res.json(events);
});

app.get("/api/proposals/:id", async (req, res) => {
  const id = req.params.id;

  const query = (await backendActor.query_proposal_by_id({
    id: +id,
  })) as QueryResponse;

  const spaces = parseJsonToModel<Proposal>(query);

  res.json(spaces);
});

app.get("/api/proposals/:id/votes", async (req, res) => {
  const id = req.params.id;

  const query = (await backendActor.get_proposal_votes_by_proposal_id({
    id: +id,
  })) as QueryResponse;

  const spaces = parseJsonToModel<ProposalOptionVote[]>(query);

  res.json(spaces);
});

app.get("/api/proposals/:id/options", async (req, res) => {
  const id = req.params.id;

  const query = (await backendActor.get_proposal_options_by_proposal_id({
    id: +id,
  })) as QueryResponse;

  const spaces = parseJsonToModel<ProposalOption[]>(query);

  res.json(spaces);
});

app.get("/apievents", async (req, res) => {
  const query = (await backendActor.get_all_space_events()) as QueryResponse;

  const events = parseJsonToModel<SpaceEvent[]>(query);

  res.json(events);
});

// app.post()

const port = 8000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
