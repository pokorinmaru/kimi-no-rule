// The words of the AI-free check (指示書 第7.3節; 第1節 原則1・3). No junior, no hint, no judging: after an
// answer the child hears only that it was kept, the same line whether it was right or not.
export const CHECK_TEXT = {
  entry: "AIなしで ためしてみる",
  title: "AIなしで ためす",
  lead: "後輩は出てきません。問題を読んで、聞かれている数を入れてね。",
  progress: (i: number, n: number): string => `${String(i)}問目（${String(n)}問のうち）`,
  pad: "聞かれている数は、いくつ？",
  kept: "こたえを、うけとりました。",
  next: "つぎへ",
  done: ["AIなしの問題は、ここまでです。", "おつかれさまでした。"] as readonly string[],
  back: "もどる",
  close: "とじる",
} as const;
