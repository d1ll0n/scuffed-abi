import { Coder, Writer } from "@ethersproject/abi/lib/coders/abstract-coder";
import { TupleCoder } from "@ethersproject/abi/lib/coders/tuple";
import { ArrayCoder } from "@ethersproject/abi/lib/coders/array";
import { DynamicOffsets, FixedOffsets, Offsets } from "./types";
import { BigNumberish } from "@ethersproject/bignumber";
import { concat } from "@ethersproject/bytes";

export class ScuffedWriter extends Writer {
  namesNest: string[] = [];
  relativeOffsets: Record<string, number> = {};
  absoluteOffsets: Record<string, DynamicOffsets | FixedOffsets> = {};
  children: Record<string, string[]> = {};
  types: Record<string, string> = {};
  isDynamic: Record<string, boolean> = {};

  constructor(wordSize: number, parentWriter?: ScuffedWriter) {
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
    const allValues = concat(this._data)
    const start = allValues.slice(0, offset.absolute);
    const end = allValues.slice(offset.absolute + 32);
    this._data = [];
    this._dataLength = 0;
    this._writeData(start)
    this.writeValue(newValue)
    this._writeData(end)
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
  writer: ScuffedWriter,
  value: Array<any> | { [name: string]: any }
): number {
  return pack(writer, this.coders, value);
};

ArrayCoder.prototype.encode = function (
  writer: ScuffedWriter,
  value: Array<any>
): number {
  if (!Array.isArray(value)) {
    this._throwError("expected array value", value);
  }

  let count = this.length;

  if (count === -1) {
    count = value.length;
    const name = writer.getName();
    if (!writer.children[name]) {
      writer.children[name] = [];
    }

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

export function pack(
  writer: ScuffedWriter,
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

  const staticWriter = new ScuffedWriter(32, writer);
  const dynamicWriter = new ScuffedWriter(32, writer);
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
        writer.relativeOffsets[`${thisName}@head`] = headOffset;
        writer.relativeOffsets[thisName] = baseOffset + dynamicOffset;
        if (thisName.endsWith(']')) {
          writer.relativeOffsets[thisName] += 32;
        }
        writeOffset(baseOffset + dynamicOffset);
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