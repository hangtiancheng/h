<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import mermaid from "mermaid";
import { useData } from "vitepress";

const props = defineProps<{
  id: string;
  graph: string;
}>();

const { isDark } = useData();
const svg = ref("");
const code = decodeURIComponent(props.graph);

const renderChart = async () => {
  mermaid.initialize({
    securityLevel: "loose",
    startOnLoad: false,
    theme: isDark.value ? "dark" : "default",
  });
  const { svg: svgCode } = await mermaid.render(props.id, code);
  const salt = Math.random().toString(36).substring(7);
  svg.value = `${svgCode}<span style="display:none">${salt}</span>`;
};

onMounted(renderChart);
watch(isDark, renderChart);
</script>

<template>
  <div class="mermaid-block" v-html="svg"></div>
</template>

<style>
@reference "tailwindcss";

.mermaid-block {
  @apply my-4 flex justify-center;
}

.mermaid-block svg {
  @apply h-auto max-w-full;
}
</style>
