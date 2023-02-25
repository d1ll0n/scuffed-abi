// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

struct Data {
  uint8 val1;
  uint32 val2;
}

contract TestContract {

    function allowsBadCalldata(Data calldata data)
        external
        pure
        returns (uint256 value)
    {
        assembly {
            value := calldataload(4)
        }
    }

    function disallowsBadCalldata(Data calldata data)
        external
        pure
        returns (uint256)
    {
        return data.val1;
    }
}
