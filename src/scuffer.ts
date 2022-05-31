import { AbiCoder, FunctionFragment } from "@ethersproject/abi";
import { Contract } from 'ethers';
import { keccak256 } from "@ethersproject/keccak256";
import { pack, ScuffedWriter } from "./ethers-overrides";

export function getScuffedContract(contract: Contract) {
  const coder = new AbiCoder();
  const obj: any = {};
  type K = keyof typeof contract.interface['functions'];
  
  for (const fnKey of Object.keys(contract.interface.functions) as Array<K>) {
    const fragment = contract.interface.functions[fnKey];
    // const isUnique = 
    const _fn = (inputs: Parameters<typeof contract[K]>) => {
      const coders = fragment.inputs.map((i) => coder._getCoder(i));
      const writer = new ScuffedWriter(32);
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

export function getScuffedFunction(fn: FunctionFragment, inputs: any) {
  const coder = new AbiCoder();
  const coders = fn.inputs.map((i) => coder._getCoder(i));
  const writer = new ScuffedWriter(32);
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