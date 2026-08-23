import type { HostNode } from '@stingjs/core';
import type { Element as SolidElement } from 'solid-js';

type NativeIntrinsicProps = {
  children?: JSX.Element;
  [property: string]: unknown;
};

export namespace JSX {
  type Element = SolidElement | HostNode | ArrayElement;

  interface ArrayElement extends Array<Element> {}

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicElements {
    view: NativeIntrinsicProps;
    text: NativeIntrinsicProps;
    button: NativeIntrinsicProps;
    image: NativeIntrinsicProps;
    textInput: NativeIntrinsicProps;
    scrollView: NativeIntrinsicProps;
  }
}
