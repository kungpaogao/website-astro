import clsx from "clsx";
import type { Component, JSX } from "solid-js";

interface IconProps {
  iconName: "home" | "project" | "about" | "gao" | "menu" | "close";
  strokeWidth?: number;
  strokeLinecap?: "butt" | "round" | "square" | "inherit";
  strokeLinejoin?:
    | "arcs"
    | "bevel"
    | "miter"
    | "miter-clip"
    | "round"
    | "inherit";
  className?: string;
  children?: JSX.Element;
}

export { Icon };

/**
 * Component to support a limited amount of icons.
 * Currently from: https://phosphoricons.com/.
 */
const Icon: Component<IconProps> = (props) => {
  switch (props.iconName) {
    case "home":
      return <HomeIcon {...props} />;
    case "project":
      return <ProjectIcon {...props} />;
    case "about":
      return <AboutIcon {...props} />;
    case "menu":
      return <MenuIcon {...props} />;
    case "close":
      return <CloseIcon {...props} />;
  }
};

const Svg: Component<IconProps> = (props) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      class={clsx(props.className ?? "h-6 w-6")}
      stroke-width={props.strokeWidth ?? 16}
      stroke-linecap={props.strokeLinecap ?? "round"}
      stroke-linejoin={props.strokeLinejoin ?? "round"}
      stroke="#000000"
      fill="none"
    >
      {props.children}
    </svg>
  );
};

const HomeIcon: Component<IconProps> = (props) => {
  return (
    <Svg {...props}>
      <title>home icon</title>
      <path d="M152,208V160a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v48a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V115.5a8.3,8.3,0,0,1,2.6-5.9l80-72.7a8,8,0,0,1,10.8,0l80,72.7a8.3,8.3,0,0,1,2.6,5.9V208a8,8,0,0,1-8,8H160A8,8,0,0,1,152,208Z" />
    </Svg>
  );
};

const ProjectIcon: Component<IconProps> = (props) => {
  return (
    <Svg {...props}>
      <title>project icon</title>
      <path d="M200,224H56a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h96l56,56V216A8,8,0,0,1,200,224Z"></path>
      <polyline points="152 32 152 88 208 88"></polyline>
      <line x1="96" y1="136" x2="160" y2="136"></line>
      <line x1="96" y1="168" x2="160" y2="168"></line>
    </Svg>
  );
};

const AboutIcon: Component<IconProps> = (props) => {
  return (
    <Svg {...props}>
      <title>about icon</title>
      <circle cx="128" cy="96" r="64" fill="none"></circle>
      <path d="M31,216a112,112,0,0,1,194,0" fill="none"></path>
    </Svg>
  );
};

const MenuIcon: Component<IconProps> = (props) => {
  return (
    <Svg {...props}>
      <title>menu icon</title>
      <line x1="40" y1="128" x2="216" y2="128"></line>
      <line x1="40" y1="64" x2="216" y2="64"></line>
      <line x1="40" y1="192" x2="216" y2="192"></line>
    </Svg>
  );
};

const CloseIcon: Component<IconProps> = (props) => {
  return (
    <Svg {...props}>
      <title>close icon</title>
      <line x1="200" y1="56" x2="56" y2="200"></line>
      <line x1="200" y1="200" x2="56" y2="56"></line>
    </Svg>
  );
};
