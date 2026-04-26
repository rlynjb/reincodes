"use client";

import "./styles.css";
import { useState } from "react";
import { sidebarNav } from "@/const/sidebarNav";
import Link from 'next/link';
import { usePathname } from "next/navigation";

interface TopicProps {
  topic_title: string;
  subtopics: SubtopicProps[]
}
interface SubtopicProps {
  title: string;
  path: string;
  subtitle?: string;
}

export default function Menu () {
  const pathname = usePathname();
  const topics: TopicProps[] = sidebarNav;

  const open = 'menu--open';
  const close = 'menu--close'
  const [ isMenu, setIsMenu ] = useState('');

  const toggleMenu = () => {
    if (isMenu === '' || isMenu === close) {
      setIsMenu(open)
    }
    if (isMenu === open) {
      setIsMenu(close)
    }
  }

  const menuButtonText = (isMenu === close || isMenu === '') ? 'projects' : 'close'

  if (pathname === '/') return null;

  return (
    <div className={`menu w-64 ${isMenu}`}>
      <button
        className="menu--toggle text-sm -rotate-90"
        onClick={toggleMenu}
      >
        {menuButtonText}
      </button>

      <div className="h-[83vh] overflow-y-auto">
      <ul>
      {topics.map((topic: TopicProps, index) => {
        return <li key={'topic'+index} className="inline-block align-top mr-2">
          <h6 className="text-sm text-gray-400">{topic.topic_title}</h6>
          <ul className="text-sm mb-4 pl-3 list-['.']">
            {topic.subtopics.map((subtopicItem: SubtopicProps, subtopicIndex) => {
              return <li key={'subtopic'+subtopicIndex}
                className="pl-1"
              >
                <Link  
                  className="block"
                  href={subtopicItem.path}
                >
                  {subtopicItem.title}
                  {subtopicItem.subtitle &&
                    <span className="block text-xs text-gray-400">
                      ({subtopicItem.subtitle})
                    </span>
                  }
                </Link>
              </li>
            })}
          </ul>
        </li>
      })}
      </ul>
      </div>
    </div>
  )
}