import type { ReactNode } from "react";

export interface Concept {
  title: string;
  href: string;
  meta?: string;
  wip?: boolean;
  external?: boolean;
  thumb: ReactNode;
}

export interface ConceptCategory {
  name: string;
  concepts: Concept[];
}

const svgWrap = (children: ReactNode) => (
  <svg viewBox="0 0 100 100" className="w-3/4 h-3/4">
    {children}
  </svg>
);

interface SortingThumbProps {
  bars: number[];
  highlight: number;
  faded?: number[];
}

const SortingThumb = ({ bars, highlight, faded }: SortingThumbProps) =>
  svgWrap(
    bars.map((h, i) => (
      <rect
        key={i}
        x={10 + i * 14}
        y={90 - h}
        width={10}
        height={h}
        fill={i === highlight ? "#534AB7" : "#AFA9EC"}
        opacity={faded?.includes(i) ? 0.4 : 1}
      />
    ))
  );

const MergeThumb = () =>
  svgWrap(
    <>
      <rect x="20" y="15" width="60" height="10" fill="#534AB7" rx="2" />
      <rect x="14" y="40" width="28" height="10" fill="#AFA9EC" rx="2" />
      <rect x="58" y="40" width="28" height="10" fill="#AFA9EC" rx="2" />
      {[10, 26, 42, 58, 74].map((x, i) => (
        <rect key={i} x={x} y="65" width="12" height="10" fill="#AFA9EC" rx="2" opacity="0.6" />
      ))}
      <line x1="50" y1="25" x2="28" y2="40" stroke="#AFA9EC" strokeWidth="1" opacity="0.5" />
      <line x1="50" y1="25" x2="72" y2="40" stroke="#AFA9EC" strokeWidth="1" opacity="0.5" />
    </>
  );

const QuickThumb = () =>
  svgWrap(
    <>
      {([[10, 35], [22, 25], [34, 50], [46, 70], [58, 60], [70, 40], [82, 20]] as [number, number][]).map(
        ([x, h], i) => (
          <rect
            key={i}
            x={x}
            y={90 - h}
            width="8"
            height={h}
            fill={i === 3 ? "#534AB7" : "#AFA9EC"}
          />
        )
      )}
      <line x1="44" y1="14" x2="56" y2="14" stroke="#534AB7" strokeWidth="1.5" />
      <line x1="50" y1="10" x2="50" y2="18" stroke="#534AB7" strokeWidth="1.5" />
    </>
  );

const HeapThumb = () =>
  svgWrap(
    <>
      <circle cx="50" cy="20" r="8" fill="#534AB7" />
      <circle cx="30" cy="45" r="7" fill="#AFA9EC" />
      <circle cx="70" cy="45" r="7" fill="#AFA9EC" />
      <circle cx="18" cy="72" r="6" fill="#AFA9EC" />
      <circle cx="42" cy="72" r="6" fill="#AFA9EC" />
      <circle cx="58" cy="72" r="6" fill="#AFA9EC" />
      <circle cx="82" cy="72" r="6" fill="#AFA9EC" />
      <line x1="50" y1="28" x2="32" y2="40" stroke="#AFA9EC" strokeWidth="1" />
      <line x1="50" y1="28" x2="68" y2="40" stroke="#AFA9EC" strokeWidth="1" />
      <line x1="28" y1="51" x2="20" y2="66" stroke="#AFA9EC" strokeWidth="1" />
      <line x1="32" y1="51" x2="40" y2="66" stroke="#AFA9EC" strokeWidth="1" />
      <line x1="68" y1="51" x2="60" y2="66" stroke="#AFA9EC" strokeWidth="1" />
      <line x1="72" y1="51" x2="80" y2="66" stroke="#AFA9EC" strokeWidth="1" />
    </>
  );

interface TreeThumbProps {
  leftLeaves: number;
}

const TreeThumb = ({ leftLeaves }: TreeThumbProps) =>
  svgWrap(
    <>
      <line x1="50" y1="22" x2="28" y2="48" stroke="#0F6E56" strokeWidth="1" />
      <line x1="50" y1="22" x2="72" y2="48" stroke="#0F6E56" strokeWidth="1" />
      <line x1="28" y1="52" x2="14" y2="76" stroke="#0F6E56" strokeWidth="1" />
      {leftLeaves >= 2 && (
        <line x1="28" y1="52" x2="42" y2="76" stroke="#0F6E56" strokeWidth="1" />
      )}
      <line x1="72" y1="52" x2="86" y2="76" stroke="#0F6E56" strokeWidth="1" />
      <circle cx="50" cy="20" r="9" fill="#0F6E56" />
      <circle cx="28" cy="50" r="8" fill="#5DCAA5" />
      <circle cx="72" cy="50" r="8" fill="#5DCAA5" />
      <circle cx="14" cy="78" r="7" fill="#5DCAA5" />
      {leftLeaves >= 2 && <circle cx="42" cy="78" r="7" fill="#5DCAA5" />}
      <circle cx="86" cy="78" r="7" fill="#5DCAA5" />
    </>
  );

const NetworkThumb = () =>
  svgWrap(
    <>
      <line x1="25" y1="30" x2="55" y2="20" stroke="#993C1D" strokeWidth="1" />
      <line x1="55" y1="20" x2="80" y2="40" stroke="#993C1D" strokeWidth="1" />
      <line x1="25" y1="30" x2="35" y2="65" stroke="#993C1D" strokeWidth="1" />
      <line x1="55" y1="20" x2="50" y2="55" stroke="#993C1D" strokeWidth="1" />
      <line x1="80" y1="40" x2="70" y2="75" stroke="#993C1D" strokeWidth="1" />
      <line x1="35" y1="65" x2="50" y2="55" stroke="#993C1D" strokeWidth="1" />
      <line x1="50" y1="55" x2="70" y2="75" stroke="#993C1D" strokeWidth="1" />
      <line x1="35" y1="65" x2="50" y2="85" stroke="#993C1D" strokeWidth="1" />
      <circle cx="25" cy="30" r="6" fill="#D85A30" />
      <circle cx="55" cy="20" r="6" fill="#993C1D" />
      <circle cx="80" cy="40" r="6" fill="#D85A30" />
      <circle cx="35" cy="65" r="6" fill="#D85A30" />
      <circle cx="50" cy="55" r="6" fill="#D85A30" />
      <circle cx="70" cy="75" r="6" fill="#D85A30" />
      <circle cx="50" cy="85" r="6" fill="#D85A30" />
    </>
  );

type GridCell = "e" | "o" | "s" | "g" | "h" | "p";

const gridFillMap: Record<GridCell, string> = {
  e: "#F5C4B3",
  p: "#F5C4B3",
  o: "#444441",
  s: "#5DCAA5",
  g: "#993C1D",
  h: "#D85A30",
};

interface GridThumbProps {
  pattern: GridCell[];
}

const GridThumb = ({ pattern }: GridThumbProps) =>
  svgWrap(
    <g stroke="#D85A30" strokeWidth="0.5">
      {pattern.map((cell, i) => {
        const row = Math.floor(i / 5);
        const col = i % 5;
        const x = 15 + col * 14;
        const y = 15 + row * 14;
        return <rect key={i} x={x} y={y} width="14" height="14" fill={gridFillMap[cell]} />;
      })}
    </g>
  );

const RiverThumb = () =>
  svgWrap(
    <>
      <rect x="10" y="20" width="35" height="60" fill="#9FE1CB" rx="2" />
      <rect x="55" y="20" width="35" height="60" fill="#5DCAA5" opacity="0.3" rx="2" />
      <line x1="48" y1="15" x2="48" y2="85" stroke="#85B7EB" strokeWidth="6" strokeDasharray="3 3" />
      <line x1="52" y1="15" x2="52" y2="85" stroke="#85B7EB" strokeWidth="6" strokeDasharray="3 3" />
      <circle cx="22" cy="35" r="5" fill="#0F6E56" />
      <circle cx="33" cy="35" r="5" fill="#444441" />
      <rect x="60" y="46" width="22" height="8" fill="#854F0B" rx="2" />
      <circle cx="22" cy="65" r="5" fill="#0F6E56" />
      <circle cx="33" cy="65" r="5" fill="#854F0B" />
    </>
  );

const RecursionThumb = () =>
  svgWrap(
    <>
      <line x1="50" y1="18" x2="25" y2="38" stroke="#993556" strokeWidth="0.8" />
      <line x1="50" y1="18" x2="75" y2="38" stroke="#993556" strokeWidth="0.8" />
      <line x1="25" y1="42" x2="14" y2="62" stroke="#993556" strokeWidth="0.8" />
      <line x1="25" y1="42" x2="36" y2="62" stroke="#993556" strokeWidth="0.8" />
      <line x1="75" y1="42" x2="64" y2="62" stroke="#993556" strokeWidth="0.8" />
      <line x1="75" y1="42" x2="86" y2="62" stroke="#993556" strokeWidth="0.8" />
      <circle cx="50" cy="16" r="5" fill="#993556" />
      <circle cx="25" cy="40" r="4" fill="#D4537E" />
      <circle cx="75" cy="40" r="4" fill="#D4537E" />
      <circle cx="14" cy="64" r="3.5" fill="#D4537E" />
      <circle cx="36" cy="64" r="3.5" fill="#D4537E" />
      <circle cx="64" cy="64" r="3.5" fill="#D4537E" />
      <circle cx="86" cy="64" r="3.5" fill="#D4537E" />
    </>
  );

const FibonacciThumb = () =>
  svgWrap(
    <>
      <line x1="50" y1="18" x2="32" y2="38" stroke="#993556" strokeWidth="0.8" />
      <line x1="50" y1="18" x2="68" y2="38" stroke="#993556" strokeWidth="0.8" />
      <line x1="32" y1="42" x2="20" y2="62" stroke="#993556" strokeWidth="0.8" />
      <line x1="32" y1="42" x2="44" y2="62" stroke="#993556" strokeWidth="0.8" />
      <line x1="68" y1="42" x2="56" y2="62" stroke="#993556" strokeWidth="0.8" />
      <line x1="68" y1="42" x2="80" y2="62" stroke="#993556" strokeWidth="0.8" />
      <circle cx="50" cy="16" r="6" fill="#993556" />
      <text x="50" y="19" textAnchor="middle" fontSize="7" fill="#FBEAF0" fontWeight="500">5</text>
      <circle cx="32" cy="40" r="5" fill="#D4537E" />
      <text x="32" y="43" textAnchor="middle" fontSize="6" fill="#FBEAF0" fontWeight="500">4</text>
      <circle cx="68" cy="40" r="5" fill="#D4537E" />
      <text x="68" y="43" textAnchor="middle" fontSize="6" fill="#FBEAF0" fontWeight="500">3</text>
      <circle cx="20" cy="64" r="4" fill="#ED93B1" />
      <circle cx="44" cy="64" r="4" fill="#ED93B1" />
      <circle cx="56" cy="64" r="4" fill="#ED93B1" />
      <circle cx="80" cy="64" r="4" fill="#ED93B1" />
    </>
  );

const RelationalThumb = () =>
  svgWrap(
    <>
      <rect x="10" y="15" width="22" height="28" rx="2" fill="#3B82F6" fillOpacity="0.15" stroke="#3B82F6" strokeWidth="1" />
      <line x1="10" y1="22" x2="32" y2="22" stroke="#3B82F6" strokeWidth="0.6" />
      <circle cx="14" cy="29" r="1" fill="#3B82F6" />
      <circle cx="14" cy="34" r="1" fill="#3B82F6" />
      <circle cx="14" cy="39" r="1" fill="#3B82F6" />

      <rect x="68" y="15" width="22" height="28" rx="2" fill="#3B82F6" fillOpacity="0.15" stroke="#3B82F6" strokeWidth="1" />
      <line x1="68" y1="22" x2="90" y2="22" stroke="#3B82F6" strokeWidth="0.6" />
      <circle cx="72" cy="29" r="1" fill="#3B82F6" />
      <circle cx="72" cy="34" r="1" fill="#3B82F6" />
      <circle cx="72" cy="39" r="1" fill="#3B82F6" />

      <rect x="39" y="57" width="22" height="28" rx="2" fill="#3B82F6" fillOpacity="0.15" stroke="#3B82F6" strokeWidth="1" />
      <line x1="39" y1="64" x2="61" y2="64" stroke="#3B82F6" strokeWidth="0.6" />
      <circle cx="43" cy="71" r="1" fill="#3B82F6" />
      <circle cx="43" cy="76" r="1" fill="#3B82F6" />
      <circle cx="43" cy="81" r="1" fill="#3B82F6" />

      <line x1="32" y1="29" x2="68" y2="29" stroke="#3B82F6" strokeWidth="0.6" strokeDasharray="2 2" />
      <line x1="21" y1="43" x2="39" y2="64" stroke="#3B82F6" strokeWidth="0.6" strokeDasharray="2 2" />
      <line x1="79" y1="43" x2="61" y2="64" stroke="#3B82F6" strokeWidth="0.6" strokeDasharray="2 2" />
    </>
  );

const gridPatternBfs: GridCell[] = [
  "e", "e", "g", "e", "e",
  "h", "o", "h", "e", "e",
  "h", "o", "e", "o", "h",
  "e", "h", "h", "h", "e",
  "e", "e", "s", "e", "e",
];

const gridPatternShortest: GridCell[] = [
  "s", "p", "e", "e", "e",
  "e", "p", "p", "e", "e",
  "e", "e", "p", "p", "e",
  "e", "e", "e", "p", "p",
  "e", "e", "e", "e", "g",
];

export const CONCEPT_CATEGORIES: ConceptCategory[] = [
  {
    name: "sorting",
    concepts: [
      {
        title: "selection sort",
        href: "/sorting/selection-sort",
        meta: "o(n²)",
        thumb: <SortingThumb bars={[30, 50, 70, 40, 60, 20]} highlight={2} />,
      },
      {
        title: "bubble sort",
        href: "/sorting/bubble-sort",
        meta: "o(n²)",
        thumb: <SortingThumb bars={[35, 55, 45, 25, 65, 40]} highlight={1} />,
      },
      {
        title: "insertion sort",
        href: "/sorting/insertion-sort",
        meta: "o(n²)",
        thumb: <SortingThumb bars={[20, 40, 60, 70, 35, 50]} highlight={3} faded={[4, 5]} />,
      },
      {
        title: "merge sort",
        href: "/sorting/merge-sort",
        meta: "o(n log n)",
        thumb: <MergeThumb />,
      },
      {
        title: "quick sort",
        href: "/sorting/quick-sort",
        meta: "o(n log n)",
        thumb: <QuickThumb />,
      },
      {
        title: "heap sort",
        href: "/sorting/heap-sort",
        meta: "o(n log n)",
        thumb: <HeapThumb />,
      },
    ],
  },
  {
    name: "graphs",
    concepts: [
      {
        title: "network diagram",
        href: "/graphs/network",
        meta: "d3 · components",
        thumb: <NetworkThumb />,
      },
      {
        title: "grid diagram",
        href: "/graphs/grid",
        meta: "bfs / dfs",
        thumb: <GridThumb pattern={gridPatternBfs} />,
      },
      {
        title: "shortest path",
        href: "/graphs/finding-shortest-path",
        meta: "dijkstra",
        thumb: <GridThumb pattern={gridPatternShortest} />,
      },
      {
        title: "river-crossing puzzle",
        href: "/graphs/river-crossing-puzzle",
        meta: "state-space",
        thumb: <RiverThumb />,
      },
    ],
  },
  {
    name: "trees",
    concepts: [
      {
        title: "binary search tree",
        href: "/trees/binary-search-tree",
        meta: "crud + traversal",
        thumb: <TreeThumb leftLeaves={2} />,
      },
      {
        title: "binary heap",
        href: "/trees/binary-heap",
        wip: true,
        thumb: <TreeThumb leftLeaves={1} />,
      },
    ],
  },
  {
    name: "recursion",
    concepts: [
      {
        title: "count all subsets",
        href: "/recursions/count-all-subsets",
        meta: "backtracking",
        thumb: <RecursionThumb />,
      },
      {
        title: "fibonacci",
        href: "/recursions/fibonacci-numbers",
        meta: "call-stack viz",
        thumb: <FibonacciThumb />,
      },
    ],
  },
  {
    name: "implementations",
    concepts: [
      {
        title: "graph",
        href: "https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/Graph.ts",
        meta: "adj-list · bfs · dfs",
        external: true,
        thumb: <NetworkThumb />,
      },
      {
        title: "binary search tree",
        href: "https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/BinarySearchTree.ts",
        meta: "crud · 3 traversals",
        external: true,
        thumb: <TreeThumb leftLeaves={2} />,
      },
      {
        title: "binary heap",
        href: "https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/BinaryHeap.ts",
        meta: "min · max · heapify",
        external: true,
        thumb: <HeapThumb />,
      },
      {
        title: "priority queue",
        href: "https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/PriorityQueue.ts",
        meta: "heap-backed",
        external: true,
        thumb: <HeapThumb />,
      },
      {
        title: "relational store",
        href: "https://github.com/rlynjb/reincodes",
        wip: true,
        external: true,
        thumb: <RelationalThumb />,
      },
    ],
  },
];
