"""Audit script for Course & Learning Content.
Inspects all 18 courses in PostgreSQL 'cnc', counting modules, lessons,
content lengths, and 12-section compliance.
"""
import asyncio
import os
import re
import json
import asyncpg

async def audit():
    dsn = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/cnc")
    conn = await asyncpg.connect(dsn)
    
    courses = await conn.fetch("SELECT id, code, title, created_at FROM courses ORDER BY code")
    print(f"=== TOTAL COURSES IN DATABASE: {len(courses)} ===")
    
    section_patterns = [
        r"##\s*1\.\s*Introduction",
        r"##\s*2\.\s*Learning Objectives",
        r"##\s*3\.\s*Core Concepts",
        r"##\s*4\.\s*Key Points",
        r"##\s*5\.\s*(Real-Life Examples|Professional Scenarios)",
        r"##\s*6\.\s*(Professional Scenarios|Do['']?s and Don['']?ts)",
        r"##\s*7\.\s*(Do['']?s and Don['']?ts|Knowledge Check)",
        r"##\s*8\.\s*(Case Study|Summary)",
        r"##\s*9\.\s*(Practical Activities|Further Learning)",
        r"##\s*10\.\s*Knowledge Check",
        r"##\s*11\.\s*Summary",
        r"##\s*12\.\s*Further Learning"
    ]
    
    course_stats = []
    
    for c in courses:
        modules = await conn.fetch(
            "SELECT id, title, slug, order_index FROM modules WHERE course_id = $1 ORDER BY order_index",
            c["id"]
        )
        total_lessons = 0
        lessons_with_12_sections = 0
        module_details = []
        
        for m in modules:
            lessons = await conn.fetch(
                "SELECT id, title, slug, content_type, duration_minutes, LENGTH(content) as content_len, content FROM lessons WHERE module_id = $1 ORDER BY order_index",
                m["id"]
            )
            total_lessons += len(lessons)
            lesson_info = []
            for l in lessons:
                content = l["content"] or ""
                # Count sections matching ## number.
                headers = re.findall(r"^##\s+(\d+)\.\s+(.*)$", content, re.MULTILINE)
                is_12_sec = len(headers) >= 8  # Full or comprehensive structured content
                if len(headers) >= 12:
                    lessons_with_12_sections += 1
                lesson_info.append({
                    "title": l["title"],
                    "length": l["content_len"],
                    "sections_count": len(headers),
                    "section_headers": [h[1] for h in headers]
                })
            module_details.append({
                "module_title": m["title"],
                "lesson_count": len(lessons),
                "lessons": lesson_info
            })
            
        course_stats.append({
            "code": c["code"],
            "title": c["title"],
            "module_count": len(modules),
            "lesson_count": total_lessons,
            "lessons_12_sections": lessons_with_12_sections,
            "modules": module_details
        })
        
    print(f"\n{'Code':<15} | {'Modules':<8} | {'Lessons':<8} | {'12-Sec Lessons':<15} | {'Course Title'}")
    print("-" * 80)
    for stat in course_stats:
        print(f"{stat['code']:<15} | {stat['module_count']:<8} | {stat['lesson_count']:<8} | {stat['lessons_12_sections']:<15} | {stat['title']}")
        
    # Write full JSON audit for reference
    with open("course_audit_output.json", "w") as f:
        json.dump(course_stats, f, indent=2)
        
    print("\nDetailed course audit written to course_audit_output.json")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(audit())
