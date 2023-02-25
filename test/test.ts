import { ethers } from "hardhat";
import { getScuffedContract } from "../src/scuffer";
import { expect } from "chai";

describe("", () => {
  let contract: any;
  before(async () => {
    const f = await ethers.getContractFactory("TestContract");
    contract = getScuffedContract(await f.deploy());
  });

  it("allowsBadCalldata", async () => {
    const scuff = contract.allowsBadCalldata({ val1: 100, val2: 1000 });
    scuff.data.val1.replace(3000);
    expect(await scuff.call()).to.eq(3000);
  });

  it("disallowsBadCalldata", async () => {
    const scuff = contract.disallowsBadCalldata({ val1: 100, val2: 1000 });
    scuff.data.val1.replace(3000);
    const err = await scuff.call().catch((err) => {
      return err;
    });
    expect(err.replacements).to.eq('Modification to: data.val1.tail @ byte 0:\n\tOld: 0x64\n\tReplacement: 0xbb8')
  });
});
