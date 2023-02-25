import {
  AbiCoder,
  FunctionFragment,
  Interface,
  ParamType,
} from "@ethersproject/abi";
import { BaseContract, Contract, ContractTransaction } from "ethers";
import { keccak256 } from "@ethersproject/keccak256";
import { pack, ScuffedWriter } from "./ethers-overrides";
import { Logger } from "ethers/lib/utils";
import { ReplaceableOffsets, ScuffedParameter } from "./types";

function getReplacementLog(writer: ScuffedWriter) {
  return writer.replacements
    .map((r) =>
      [
        `Modification to: ${r.name} @ byte ${r.position}:`,
        `\tOld: ${r.oldValue}`,
        `\tReplacement: ${r.newValue}`,
      ].join("\n")
    )
    .join("\n\n");
}

async function buildCall(
  writer: ScuffedWriter,
  contract: Contract,
  fragment: FunctionFragment,
  rewritableObject: any,
  inputs: any
) {
  const result = await contract.signer
    .call({
      to: contract.address,
      data: rewritableObject.encode(),
    })
    .catch((err) => {
      err.replacements = getReplacementLog(writer);
      throw err;
    });
  /// Try to decode the returndata
  try {
    let value = contract.interface.decodeFunctionResult(fragment, result);
    if (fragment.outputs.length === 1) {
      value = value[0];
    }
    return value;
  } catch (error) {
    if (error.code === Logger.errors.CALL_EXCEPTION) {
      error.address = contract.address;
      error.args = inputs;
    }
    error.replacements = writer.replacements
      .map((r) =>
        [
          `Modification to: ${r.name} @ byte ${r.position}:`,
          `\tOld: ${r.oldValue}`,
          `\tReplacement: ${r.newValue}`,
        ].join("\n")
      )
      .join("\n\n");
    throw error;
  }
}

type FunctionNames<Obj, K> = K extends string
  ? K extends keyof Obj
    ? K
    : never
  : never;

export type ScuffedContract<C extends Contract> = {
  [K in FunctionNames<C["functions"], keyof C["functions"]>]: (
    ...args: Parameters<C["functions"][K]>
  ) => {
    encode: () => string;
    encodeArgs: () => string;
    execute: () => Promise<ContractTransaction>;
    call: () => ReturnType<C["functions"][K]>;
  } & { [key: string]: ScuffedParameter };
};

export function getScuffedContract<C extends Contract>(
  contract: C
): ScuffedContract<C> {
  const coder = new AbiCoder();
  const obj: any = {};
  const keys = Object.keys(contract.interface.functions);

  keys.forEach((key) => {
    const fragment = contract.interface.functions[key];
    const name = fragment.name;
    const _fn = (...inputs: any[]) => {
      const coders = fragment.inputs.map((i) => coder._getCoder(i));
      const writer = new ScuffedWriter(32);
      pack(writer, coders, inputs);
      coders.map((coder) => writer.updateChildren(coder.localName));
      const selector = keccak256(Buffer.from(fragment.format("sighash"))).slice(
        0,
        10
      );
      const rewritableObject: any = coders.reduce(
        (obj, coder) => ({
          ...obj,
          [coder.localName]: writer.createStructuredOffsetsObject(
            coder.localName,
            coder
          ),
        }),
        {
          encode: () => selector.concat(writer.data.slice(2)),
          encodeArgs: () => writer.data,
          execute: () =>
            contract.signer
              .sendTransaction({
                to: contract.address,
                data: rewritableObject.encode(),
              })
              .catch((err) => {
                err.replacements = getReplacementLog(writer);
                throw err;
              }),
          call: async () =>
            buildCall(writer, contract, fragment, rewritableObject, inputs),
        }
      );
      return rewritableObject;
    };
    if (
      Object.values(contract.interface.functions).filter((f) => f.name === name)
        .length === 1
    ) {
      obj[name] = _fn;
    }
    obj[key] = _fn;
  });
  return obj;
}

export function getScuffedFunction(fn: FunctionFragment, ...inputs: any) {
  const coder = new AbiCoder();
  const coders = fn.inputs.map((i) => coder._getCoder(i));
  const writer = new ScuffedWriter(32);
  pack(writer, coders, inputs);
  coders.map((coder) => writer.updateChildren(coder.localName));
  const selector = keccak256(Buffer.from(fn.format("sighash"))).slice(0, 10);
  const rewritableObject: any = coders.reduce(
    (obj, coder) => ({
      ...obj,
      [coder.localName]: writer.createStructuredOffsetsObject(
        coder.localName,
        coder
      ),
    }),
    {
      encode: () => selector.concat(writer.data.slice(2)),
      encodeArgs: () => writer.data.slice(2),
    }
  );

  return rewritableObject;
}

export function getScuffedParams(types: ParamType[], inputs: any) {
  const coder = new AbiCoder();
  const coders = types.map((i) => coder._getCoder(i));
  const writer = new ScuffedWriter(32);
  pack(writer, coders, inputs);
  coders.map((coder) => writer.updateChildren(coder.localName));

  const rewritableObject: any = coders.reduce(
    (obj, coder) => ({
      ...obj,
      [coder.localName]: writer.createStructuredOffsetsObject(
        coder.localName,
        coder
      ),
    }),
    {
      encode: () => writer.data,
      encodeArgs: () => writer.data,
    }
  );

  const getReplacements = () =>
    writer.replacements
      .map((r) =>
        [
          `Modification to: ${r.name} @ byte ${r.position}:`,
          `\tOld: ${r.oldValue}`,
          `\tReplacement: ${r.newValue}`,
        ].join("\n")
      )
      .join("\n\n");

  rewritableObject.getReplacements = getReplacements;
  return rewritableObject;
}
