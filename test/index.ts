import { AbiCoder, FunctionFragment, Interface } from "@ethersproject/abi";
import { Contract } from 'ethers';
import * as constants from "@ethersproject/constants/lib";
import { keccak256 } from "@ethersproject/keccak256";
import { getScuffedContract, getScuffedFunction } from "../src/scuffer";


const val = FunctionFragment.from({
  inputs: [
    {
      components: [
        {
          internalType: "enum ConduitItemType",
          name: "itemType",
          type: "uint8",
        },
        {
          internalType: "address",
          name: "token",
          type: "address",
        },
        {
          internalType: "address",
          name: "from",
          type: "address",
        },
        {
          internalType: "address",
          name: "to",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "identifier",
          type: "uint256",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
      ],
      internalType: "struct ConduitTransfer[]",
      name: "standardTransfers",
      type: "tuple[]",
    },
    {
      components: [
        {
          internalType: "address",
          name: "token",
          type: "address",
        },
        {
          internalType: "address",
          name: "from",
          type: "address",
        },
        {
          internalType: "address",
          name: "to",
          type: "address",
        },
        {
          internalType: "uint256[]",
          name: "ids",
          type: "uint256[]",
        },
        {
          internalType: "uint256[]",
          name: "amounts",
          type: "uint256[]",
        },
      ],
      internalType: "struct ConduitBatch1155Transfer[]",
      name: "batchTransfers",
      type: "tuple[]",
    },
  ],
  name: "executeWithBatch1155",
  outputs: [
    {
      internalType: "bytes4",
      name: "magicValue",
      type: "bytes4",
    },
  ],
  stateMutability: "view",
  type: "function",
});

const values = {
  standardTransfers: [
    {
      itemType: 1, // ERC20
      token: constants.AddressZero,
      from: constants.AddressZero, // ignored for ETH
      to: constants.AddressZero,
      identifier: 0,
      amount: 0,
    }
  ],
  batchTransfers: [
    {
      token: constants.AddressZero.slice(0, 40).concat('01'),
      from: constants.AddressZero,
      to: constants.AddressZero,
      ids: [100, 100],
      amounts: [5, 5],
    },
  ],
};

const val1 = FunctionFragment.from({
  inputs: [
    {
      components: [
        {
          internalType: "uint256",
          name: "identifier",
          type: "uint256",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "bytes",
          name: "data",
          type: "bytes",
        },
      ],
      internalType: "struct ConduitTransfer[]",
      name: "standardTransfers",
      type: "tuple[]",
    }
  ],
  name: "executeWithBatch1155",
  stateMutability: "view",
  type: "function",
});

const inputs1 = {
  standardTransfers: [
    {
      identifier: 3,
      amount: 5000,
      data: "0xffaabbcc00"
    }
  ]
}

const testContract = () => {
  const iface = new Interface([val]);
  const contract = getScuffedContract(new Contract(constants.AddressZero, iface));
  const scuffed = contract.executeWithBatch1155(values);

  scuffed.batchTransfers[0].amounts[0].replace(500)
  scuffed.batchTransfers[0].ids[1].replace(5000)
  let decoded = iface.decodeFunctionData(val, scuffed.encode())
  if (
    decoded.batchTransfers[0].amounts[0].toNumber() !== 500 ||
    decoded.batchTransfers[0].ids[1].toNumber() !== 5000
  ) {
    throw Error()
  }

  scuffed.batchTransfers[0].ids.length.replace(1);
  decoded = iface.decodeFunctionData(val, scuffed.encode())
  if (decoded.batchTransfers[0].ids.length !== 1) {
    throw Error()
  }
  scuffed.batchTransfers[0].ids[0].replace(91);
  decoded = iface.decodeFunctionData(val, scuffed.encode())
  if (decoded.batchTransfers[0].ids[0].toNumber() !== 91) {
    throw Error()
  }
}

const testFunction = () => {
  const iface = new Interface([val]);
  const scuffed = getScuffedFunction(val, values);

  scuffed.batchTransfers[0].amounts[0].replace(500)
  scuffed.batchTransfers[0].ids[1].replace(5000)
  let decoded = iface.decodeFunctionData(val, scuffed.encode())
  if (
    decoded.batchTransfers[0].amounts[0].toNumber() !== 500 ||
    decoded.batchTransfers[0].ids[1].toNumber() !== 5000
  ) {
    throw Error()
  }

  scuffed.batchTransfers[0].ids.length.replace(1);
  scuffed.batchTransfers[0].ids[0].replace(2);
  decoded = iface.decodeFunctionData(val, scuffed.encode())
  console.log(decoded.batchTransfers[0].ids[0])
  if (
    decoded.batchTransfers[0].ids.length !== 1
  ) {
    throw Error()
  }

  scuffed.batchTransfers[0].ids[0].replace(91);
  decoded = iface.decodeFunctionData(val, scuffed.encode())
  if (decoded.batchTransfers[0].ids[0].toNumber() !== 91) {
    throw Error()
  }
}

const testFunction2 = () => {
  const iface = new Interface([val1]);
  const scuffed = getScuffedFunction(val1, inputs1);

  scuffed.standardTransfers[0].data.length.replace(3)
  let decoded = iface.decodeFunctionData(val1, scuffed.encode())
  if (
    decoded.standardTransfers[0].data.length !== 8
  ) {
    throw Error()
  }
  scuffed.standardTransfers[0].data.length.replace(5)
  scuffed.standardTransfers[0].data.tail.replace('0xaabbccddee'.padEnd(66, '0'))
  decoded = iface.decodeFunctionData(val1, scuffed.encode())
  if (
    decoded.standardTransfers[0].data !== '0xaabbccddee'
  ) {
    throw Error()
  }
}

testContract()
testFunction()
testFunction2()
console.log('all good')