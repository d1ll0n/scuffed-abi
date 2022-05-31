# Scuffed ABI

Package for modifying ABI encoded data. Mostly useful for testing failure cases of ABI decoders.

Given an ethers `Contract` object, you can build a scuffed contract using the function `getScuffedContract`.

This will return an object whose keys are the contract's function and which take the same input parameters as their associated functions.

Calling one of these functions will return an object mirroring the structure of the input parameters, with a `ReplaceableOffsets` object for each value's head, tail or length, as well as parameters for all nested values. See [types](#types) for more information on data types.

The `ReplaceableOffsets` type has a function `replace` which allows you to replace a value after it's been encoded.

### Example

Suppose we have the function:

```typescript
struct SignedTransfer {
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
// Modify the offset to the `transfers` array
scuffedFnCall.transfers.head.replace(0x20)
// Modify the length of the signature in the first transfer
scuffedFnCall.transfers[0].signature.length.replace(0x40)
// Modify the offset to the first transfer
scuffedFnCall.transfers[0].head.replace(0)
// Modify `value`
scuffedFnCall.transfers[0].value.replace(500)
// Encode the function calldata
const data = scuffedFnCall.encode()
```

### Types

```typescript
type ReplaceableOffsets = {
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

Static parameters will have values `{ relative: number; absolute: number; replace: (newValue: BigNumberish) => string }`

**Example**

In the example code above, the `scuffedFnCall` will be structured as:

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