<script lang="ts">
  type ILoadingEffect = {
    width?: number
    height?: number
    className?: string
  }

  let { height, width, className }: ILoadingEffect = $props()
</script>

<div class={`skeleton ${className}`} style:height style:width></div>
