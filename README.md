# Scuffed ABI

Package for modifying ABI encoded data. Mostly useful for low-level testing of calldata offsets or lengths.

Given an ethers `Contract` object, you can build a scuffed contract using the function `getScuffedContract`.

This will return an object whose keys are the contract's function and which take the same input parameters as their associated functions.

We use a `ReplaceableOffsets` type for each parameter:

```typescript
type Offsets = {
  relative: number;   // position of the parameter relative to its parent
  absolute: number;   // absolute position of the parameter in the encoded args
  replace: (value: BigNumberish) => string; // replace the value in the encoded args
}
```

Dynamic values will have:

```typescript
type DynamicOffsets = {
  head: ReplaceableOffsets;
  tail: ReplaceableOffsets;
}
```

Arrays and bytes parameters will have an additional `length: ReplaceableOffsets` field.

The structure will completely mirror that  of the input parameters.

Suppose we have the function:

```typescript
type SignedTransfer = {
  address to;
  uint256 value;
  bytes signature;
}

function validateSignatures(SignedTransfer[] calldata transfers) external;
```

Then we can use scuffed abi like so:
```typescript
const scuffed = getScuffedContract(contract);
const scuffedFnCall = scuffed.validateSignatures([{
  to: wallet.address,
  value: 1000,
  signature: sign(defaultAbiCoder.encode(['address', 'bytes'], [wallet.address, 1000]))
}]);
```

The result of this will look like:
```typescript
{
  encode: () => string // Encode the function call with all updated parameters
  encodeArgs: () => string // Encode the input parameters without the selector
  execute: () => Promise<Transaction> // Execute the transaction with the updated parameters
  call: () => Promise<string> // Call the function with the updated parameters
  transfers: [
    {
      length: ReplaceableOffsets
      head: ReplaceableOffsets
      tail: ReplaceableOffsets
      '0': {
        head: ReplaceableOffsets
        tail: ReplaceableOffsets

        to: ReplaceableOffsets
        value: ReplaceableOffsets

        signature: {
          length: ReplaceableOffsets
          head: ReplaceableOffsets
          tail: ReplaceableOffsets
        }
      }
    }
  ]
}
```



Static parameters will have values `{ relative: number; absolute: number; replace: (newValue: BigNumberish) => string }`

Where `relative` is the position of the object relative to its parent and `absolute` is the absolute pointer to the value in the encoded arguments buffer.

The `replace` function will replace the 

For example, the function:

```ts
import { ethers } from "hardhat";
import getScuffedContract from "scuffed-abi";

async function test() {
  const contract = await 
}

```
