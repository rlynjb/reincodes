export const C1_INTRO_TO_AUTOMATED_TESTING = [
  {
    problem: "What is Automated test?",
    title: "automated tests are programs that automate the task of testing your software.",
    desc: `They interface with your application to perform actions and compare the actual result with the expected output you have previously defined.
    <br>
    <br>
    NOTE: You should use a separate testing db for your tests. Do not pollute your production db with testing data.
    `,
    sample: `
    `
  },
  {
    problem: "How do we prevent introducing unexpected behavior during implementation of new feature of fixing bug? (Why do we automate tests? pt1)",
    title: "Predictability",
    desc: `
    - Predictability
    <br>
    having a predictable development process means preventing the introduction of unexpected behavior during the implementation of a feature or the fixing of a bug.
    <br>
    The smaller the distance between the act of writing code and receiving feedback, the more predictable development becomes.
    <br>
    When a test fails after you've written only 10 lines of code, you have only 10 lines of code to worry about. Even if the bug is not within those 10 lines, it becomes way easier to detect which one of them provoked misbehavior somewhere else.
    <br>
    remember, the less time it takes to get feedback once you've written code, the more predictable your development process will be.
    <br>
    <br>
    Often, developers have to throw work away because they've done too many changes at once. When those changes caused so many parts of the application to break, they didn't know where to start. It was easier to start from scratch than to ix the mess they had already created.
    `,
    sample: ``
  },
  {
    problem: "How do we prevent making mistakes when executing the same exact steps when running tests? (Why do we automate tests? pt2)",
    title: "Reproducibility",
    desc: `
    - Reproducibility
    <br>
    the more steps a particular task has, the more likely a human is to make mistakes following them. Automated tests make it easier and quicker too reporduce bugs and ensure they aren't present anymore.
    <br>
    <br>
    for example: let's assume you find bugs when you test your application, like being able to check out with an empty cart or with an invalid credit card. for you to find those bugs, you had to go through a series of steps manually.
    <br>
    even if you decide to maintain a checklist for those test cases, you will have the overhead of keeping that documentation always up-to-date. if you ever forget to update it and something not described in a test case happens, who's wrong? the test case or the application?
    <br>
    Automated tests do the exact same actions every time you execute them. When a machine is running tests, it neither forgets any steps nor makes mistakes.
    `,
    sample: ``
  },
  {
    problem: "How do we ensure our work isn't going to interfere with someone else's work? (Why do we automate tests? pt3)",
    title: "Collaboration",
    desc: `
    When a programmer adds automated tests for their features, everyone else benefits. If your coworker's work ash tests, you don't need to as them how to test their changes. When the time comes for you to merge both peices of work, you can simply run the existing automated tests instead of going though the whole manual testing process again.
    <br>
    Even  if your changes build on top of theirs, tests will serve as up-to-date documentation to guide further work. Well-written tests are the best documentation a developer can have. Because:
    <br>
    - They need to pass <br>
    - They will always be up-to-date <br>
    <br>
    If you are going to write technical documentation anyway, why not write a test instead?
    <br>
    Writing tests whenever you make changes create a virtuous collaboration cycle where one developer helps those who will touch that part of the codebase next.
    <br>
    They become even more effective when paired with other practices such as code review.
    `,
    sample: ``
  },
  {
    problem: "What are the benefits of writing automated tests?  (Why do we automate tests? pt4)",
    title: "Speed",
    desc: `
    Initially, writing a test can be time-consuming, too, even more than doing a manual test, but the more you run it, the more value you extract from it.
    <br>
    If it takes you one minute to do a manual test and you spend five minutes writing one that's automated, as soon as it runs for the 5th time it will have paid for itself - and that test is going to run way more then 5 times.
    <br>
    Writing tests is like buying stocks. You may pay a big price upfront, but you will continue to reap the dividends for a long time.
    <br>
    Long-term projects are the ones that benefit the most from tests. The longer the project runs, the ore effort is saved, and the more you can invest in new features or other activities.
    `,
    sample: ``
  }
]

export default C1_INTRO_TO_AUTOMATED_TESTING
