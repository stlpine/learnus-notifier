export type Assignment = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  url: string;
  dueAt: Date | null;
  isSubmitted: boolean;
  type: "assignment";
};

export type Lecture = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  url: string;
  closesAt: Date | null;
  isCompleted: boolean;
  type: "lecture";
};

export type ScrapedItem = Assignment | Lecture;
