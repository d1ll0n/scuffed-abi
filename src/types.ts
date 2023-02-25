import { BigNumberish } from "ethers";

export type Offsets = {
  relative: number;
  absolute: number;
};

export type ElementOffsets<HeadType = Offsets | undefined> = {
  parent: string;
  head: HeadType;
  tail: Offsets;
};

export type DynamicOffsets = ElementOffsets<Offsets>;

export type FixedOffsets = ElementOffsets<undefined>;

export type ParamOffsets =
  | ElementOffsets
  | ElementOffsets[]
  | Record<string, ElementOffsets>;

export type ReplaceableOffsets = Offsets & {
  replace: (value: BigNumberish) => string;
};

type ScuffedValueParameter = ReplaceableOffsets;

type ScuffedReferenceParameter = {
  head: ReplaceableOffsets;
  tail: ReplaceableOffsets;
};
type ScuffedArrayParameter = ScuffedParameter[] &
  ScuffedReferenceParameter & { length: ReplaceableOffsets };

type ScuffedTupleParameter = {
  [key: string]: ScuffedParameter;
};

export type ScuffedParameter =
  | ScuffedValueParameter
  | ScuffedReferenceParameter
  | ScuffedArrayParameter
  | ScuffedTupleParameter;