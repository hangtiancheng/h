import { defineComponent, onMounted, ref, watch } from "vue";
import mermaid from "mermaid";
import { useData } from "vitepress";

export default defineComponent({
  name: "Mermaid",
  props: {
    id: { type: String, required: true },
    graph: { type: String, required: true },
  },
  setup(props) {
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

    return () => <div class="mermaid-block" innerHTML={svg.value} />;
  },
});
