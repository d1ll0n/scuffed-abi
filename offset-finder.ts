import { Coder, Writer } from "@ethersproject/abi/lib/coders/abstract-coder";
import { TupleCoder } from "@ethersproject/abi/lib/coders/tuple";
import { ArrayCoder } from "@ethersproject/abi/lib/coders/array";
import { AbiCoder, FunctionFragment, Interface } from "@ethersproject/abi";
import { Contract } from 'ethers';
import * as constants from "@ethersproject/constants/lib";
import { DynamicOffsets, FixedOffsets, Offsets } from "./types";
import { BigNumberish } from "@ethersproject/bignumber";
import { concat } from "@ethersproject/bytes";
import { keccak256 } from "@ethersproject/keccak256";

class NewWriter extends Writer {
  namesNest: string[] = [];
  relativeOffsets: Record<string, number> = {};
  absoluteOffsets: Record<string, DynamicOffsets | FixedOffsets> = {};
  children: Record<string, string[]> = {};
  types: Record<string, string> = {};
  isDynamic: Record<string, boolean> = {};

  constructor(wordSize: number, parentWriter?: NewWriter) {
    super(wordSize);
    if (parentWriter) {
      this.namesNest = parentWriter.namesNest
      this.relativeOffsets = parentWriter.relativeOffsets
      this.absoluteOffsets = parentWriter.absoluteOffsets
      this.children = parentWriter.children
      this.types = parentWriter.types
      this.isDynamic = parentWriter.isDynamic
    }
    this.getName.bind(this)
    this.updateChildren.bind(this)
    this.createStructuredOffsetsObject.bind(this)
  }

  replaceWord(offset: Offsets, newValue: BigNumberish) {
    // let bytes: Uint8Array = concat(this._data);

    const allValues = concat(this._data)
    console.log(allValues.length);
    console.log(this._dataLength)
    // this._data.reduce((bytes, bytesArr) => concat([bytes, bytesArr]), new Uint8Array());
    const start = allValues.slice(0, offset.absolute);
    const end = allValues.slice(offset.absolute + 32);
    this._data = [];
    this._dataLength = 0;
    console.log(start.length)
    this._writeData(start)
    this.writeValue(newValue)
    this._writeData(end)
    console.log(this._dataLength)
    return this.data;
  }

  getName() {
    const nameParts: string[] = [];
    const nest = this.namesNest.filter(Boolean);
    for (let i = 0; i < nest.length; i++) {
      const name = nest[i];
      if (i > 0 && !name.includes("[")) nameParts.push(".");
      nameParts.push(name);
    }
    return nameParts.join("");
  };

  updateChildren(parent: string) {
    if (!this.absoluteOffsets[parent]) {
      const headOffset = this.relativeOffsets[`${parent}@head`];
      const tailOffset = this.relativeOffsets[parent];
      this.absoluteOffsets[parent] = {
        parent: "",
        head: {
          relative: headOffset,
          absolute: headOffset,
        },
        tail: {
          relative: tailOffset,
          absolute: tailOffset,
        },
      };
    }
    // const parentIsDynamicArray = this.
    const parentOffset = (this.absoluteOffsets[parent] as DynamicOffsets).tail
      .absolute;
    for (const child of this.children[parent] || []) {
      const headOffset = this.relativeOffsets[`${child}@head`];
      const tailOffset = this.relativeOffsets[child];
      // if ()
      this.absoluteOffsets[child] = {
        parent,
        head: headOffset
          ? {
              relative: headOffset,
              absolute: headOffset + parentOffset,
            }
          : undefined,
        tail: {
          relative: tailOffset,
          absolute: tailOffset + parentOffset,
        },
      };
      this.updateChildren(child);
    }
  };

  getReplaceableAbsoluteOffsets(name: string) {
    const { head, tail } = this.absoluteOffsets[name];
    return {
      head: head ? {
        ...head,
        replace: (value: BigNumberish) => this.replaceWord(head, value)
      } : undefined,
      tail: tail ? {
        ...tail,
        replace: (value: BigNumberish) => this.replaceWord(tail, value)
      } : undefined,
    }
  }

  createStructuredOffsetsObject(name: string, coder: Coder): any {
    const _children = this.children[name];
    const _offsets = this.getReplaceableAbsoluteOffsets(name);
  
    if (!_children) {
      return coder.dynamic ? _offsets : _offsets.tail;
    }
  
    if (coder instanceof TupleCoder) {
      return _children.reduce(
        (obj, child, i) => ({
          ...obj,
          [child.replace(`${name}.`, "")]: this.createStructuredOffsetsObject(
            child,
            coder.coders[i]
          ),
        }),
        {
          ..._offsets,
        }
      );
    } else if (coder instanceof ArrayCoder) {
      return _children.reduce(
        (obj, child, i) => ({
          ...obj,
          [i]: this.createStructuredOffsetsObject(child, coder.coder),
        }),
        {
          ..._offsets,
          length: _offsets.tail
        }
      );
    } else {
      return _offsets;
    }
  };
}

TupleCoder.prototype.encode = function (
  writer: NewWriter,
  value: Array<any> | { [name: string]: any }
): number {
  return pack(writer, this.coders, value);
};

ArrayCoder.prototype.encode = function (
  writer: NewWriter,
  value: Array<any>
): number {
  if (!Array.isArray(value)) {
    this._throwError("expected array value", value);
  }

  let count = this.length;

  if (count === -1) {
    count = value.length;
    console.log(new Array(5).fill(`${this.localName} == ${writer.getName()}`).join('\n'));
    const name = writer.getName();
    if (!writer.children[name]) {
      writer.children[name] = [];
    }
    // writer.children[name].push(`${name}@length`)

    writer.writeValue(value.length);
  }

  const coders = [];
  for (let i = 0; i < value.length; i++) {
    const coder = this.coder;
    const newCoder = new Proxy(coder, {
      get(target, prop) {
        if (prop === "localName") return `[${i}]`;
        return (target as any)[prop];
      },
    });
    coders.push(newCoder);
  }

  return pack(writer, coders, value);
};

const removeParentName = (parent: string, child: string) => {};

function pack(
  writer: NewWriter,
  coders: ReadonlyArray<Coder>,
  values: Array<any> | { [name: string]: any }
): number {
  let arrayValues: Array<any> = [];

  if (Array.isArray(values)) {
    arrayValues = values;
  } else if (values && typeof values === "object") {
    const unique: { [name: string]: boolean } = {};

    arrayValues = coders.map((coder) => {
      const name = coder.localName;
      if (!name) {
        throw Error(
          `cannot encode object for signature with missing names `
          + JSON.stringify({
            argument: "values",
            coder: coder,
            value: values,
          })
        );
      }

      if (unique[name]) {
        throw Error("cannot encode object for signature with duplicate names")
      }

      unique[name] = true;

      return values[name];
    });
  } else {
    throw Error(`invalid tuple value ${JSON.stringify(values)}`)
  }

  if (coders.length !== arrayValues.length) {
    throw Error(`types/value length mismatch ${JSON.stringify(values)}`)
  }

  const staticWriter = new NewWriter(32, writer);
  const dynamicWriter = new NewWriter(32, writer);
  const updateFuncs: Array<(baseOffset: number) => void> = [];

  const parentName = writer.getName();
  if (parentName && !writer.children[parentName]) writer.children[parentName] = [];

  coders.forEach((coder, index) => {
    const value = arrayValues[index];
    writer.namesNest.push(coder.localName);

    const thisName = writer.getName();
    writer.types[thisName] = coder.name;
    writer.isDynamic[thisName] = coder.dynamic
    if (parentName) {
      writer.children[parentName].push(thisName);
    }
    if (coder.dynamic) {
      // Get current dynamic offset (for the future pointer)
      // This is the size of all the dynamic values that have been
      // written for the entire struct
      const dynamicOffset = dynamicWriter.length;
      // Get current static offset
      // This is the size of all the static (head) values
      // that have been written.
      const headOffset = staticWriter.length;

      // Encode the dynamic value into the dynamicWriter
      coder.encode(dynamicWriter, value);

      // Write a temporary value to the head
      // Later, we will receive the total size of the static part
      const writeOffset = staticWriter.writeUpdatableValue();
      updateFuncs.push((baseOffset: number) => {
        console.log(
          `dyn ${thisName} : ${
            baseOffset + dynamicOffset
          } (${baseOffset} + ${dynamicOffset}) Head: ${headOffset}`
        );
        writer.relativeOffsets[`${thisName}@head`] = headOffset;
        writer.relativeOffsets[thisName] = baseOffset + dynamicOffset;
        if (thisName.endsWith(']')) {
          writer.relativeOffsets[thisName] += 32;
        }
        writeOffset(baseOffset + dynamicOffset);
        if (thisName.includes(`batchTransfers[0]`)) {
          console.log(staticWriter.relativeOffsets[thisName].toString(16))
        }
      });
    } else {
      writer.relativeOffsets[thisName] = staticWriter.length;
      if (thisName.endsWith(']')) {
        writer.relativeOffsets[thisName] += 32;
      }
      coder.encode(staticWriter, value);
    }
    writer.namesNest.pop();
  });

  // Backfill all the dynamic offsets, now that we know the static length
  updateFuncs.forEach((func) => {
    func(staticWriter.length);
  });

  let length = writer.appendWriter(staticWriter);
  length += writer.appendWriter(dynamicWriter);
  return length;
}

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

const coder = new AbiCoder();
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

function getScuffedContract(contract: Contract) {
  const obj: any = {};
  type K = keyof typeof contract.interface['functions'];
  console.log(Object.keys(contract.interface.functions))
  
  for (const fnKey of Object.keys(contract.interface.functions) as Array<K>) {
    const fragment = contract.interface.functions[fnKey];
    // const isUnique = 
    const _fn = (inputs: Parameters<typeof contract[K]>) => {
      const coders = fragment.inputs.map((i) => coder._getCoder(i));
      const writer = new NewWriter(32);
      pack(writer, coders, inputs);
      coders.map((coder) => writer.updateChildren(coder.localName));
      const selector = keccak256(Buffer.from(fragment.format('sighash'))).slice(0, 10);
      const rewritableObject: any = coders.reduce(
        (obj, coder) => ({
          ...obj,
          [coder.localName]: writer.createStructuredOffsetsObject(coder.localName, coder),
        }),
        {
          encode: () => selector.concat(writer.data.slice(2)),
          encodeArgs: () => writer.data,
          execute: () => contract.signer.sendTransaction({
            to: contract.address,
            data: rewritableObject.encode()
          }),
          call: () => contract.signer.call({
            to: contract.address,
            data: rewritableObject.encode()
          })
        }
      );
      return rewritableObject;
    }
    const name = fragment.name;
    if (Object.values(contract.interface.functions).filter(f => f.name === name).length === 1) {
      obj[name] = _fn;
    }
    obj[fnKey] = _fn;
  }
  return obj;
}

const c = getScuffedContract(new Contract(constants.AddressZero, ([val as any])));
c.executeWithBatch1155(values)

function getScuffed(fn: FunctionFragment, inputs: any) {
  const coders = fn.inputs.map((i) => coder._getCoder(i));
  const writer = new NewWriter(32);
  pack(writer, coders, inputs);
  coders.map((coder) => writer.updateChildren(coder.localName));
  const selector = keccak256(Buffer.from(fn.format('sighash'))).slice(0, 10);
  const rewritableObject: any = coders.reduce(
    (obj, coder) => ({
      ...obj,
      [coder.localName]: writer.createStructuredOffsetsObject(coder.localName, coder),
    }),
    {
      encode: () => selector.concat(writer.data.slice(2)),
      encodeArgs: () => writer.data.slice(2)
    }
  );

  return rewritableObject;
}

// new Interface([]).getError("Invalid1155BatchTransferEncoding")
//getError('Invalid1155BatchTransferEncoding()').format()
// const coders = val.inputs.map((i) => coder._getCoder(i));
// const writer = new NewWriter(32);
// console.log(pack(writer, coders, values));
// coders.map((coder) => coder.localName).map(writer.updateChildren);
// const output: any = coders.reduce(
//   (obj, coder) => ({
//     ...obj,
//     [coder.localName]: writer.createStructuredOffsetsObject(coder.localName, coder),
//   }),
//   {}
// );
const scuffed = getScuffed(val, values);

/* const printOffsetWord = (offset: Offsets) => {
  if (offset) {

    console.log(writer.data.slice(2).slice(
      offset.absolute*2,
      offset.absolute*2 + 128
    ).match(/.{1,64}/g))
  }
} */
// scuffed.batchTransfers[0].amounts[0].replace(500)
// scuffed.batchTransfers[0].ids[1].replace(5000)
scuffed.batchTransfers[0].ids.length.replace(2)

const decoded = new Interface([val]).decodeFunctionData(val, scuffed.encode())
// const decoded = defaultAbiCoder.decode([val.format()], scuffed.encode())

console.log(
  decoded.batchTransfers[0].ids.length
  // decoded.batchTransfers[0].ids[0].toNumber() == 100 &&
  // decoded.batchTransfers[0].ids[1].toNumber() == 5000 &&
  // decoded.batchTransfers[0].amounts[0].toNumber() == 500 &&
  // decoded.batchTransfers[0].amounts[1].toNumber() == 5
)
// (val.inputs, scuffed.encode());

// const scuffed = defaultAbiCoder.decode(val.inputs, offsets.batchTransfers[0].amounts[1].replace(500))

// console.log(scuffed.batchTransfers[0].amounts[1].toNumber())