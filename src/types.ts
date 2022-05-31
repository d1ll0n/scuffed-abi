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
  | Record<string, ElementOffsets>
  | ElementOffsets[];

export type ReplaceableOffsets = Offsets & {
  replace: (value: BigNumberish) => string
}