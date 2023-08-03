# 0-0-0 GPT Chess

Play chess against GPT-4 in your browser. Have GPT-4 analyze positions and explain them in natural language.

<p align="center">
    <img width="95%" alt="Play GPT" src="https://github.com/elh/0-0-0/assets/1035393/093fe235-c140-4373-a568-5f5ef33899ec">
</p>

### Why?

As a bad chess player, one of the barriers to improving is the effort required in order to analyze games. Even with engine lines, bad players cannot easily understand the key ideas between good and bad moves. A chess-playing LLM could be an impossibly patient, accessible training partner that reduces that friction.

I am also generally interested in less obvious deep integrations of LLM's within applications.

Now, the unfortunate reality is that GPT-4 at the moment is pretty bad at chess often proposing invalid moves and obvious blunders. From my very limited testing, good performance is easily explained by pre-training on theory. So, this will be a fun and easy way to see how it improves over time in this high complexity task.

### Improvements

- [ ] Combine a conventional engine with GPT. Have engine own evaluation of lines and lean on GPT to explain them.
    * This was the original idea but I didn't immediately find a JS engine I wanted to integrate.
- [ ] Allow chatting with GPT in analysis mode
- [ ] Load and export games w/ GPT commentary
