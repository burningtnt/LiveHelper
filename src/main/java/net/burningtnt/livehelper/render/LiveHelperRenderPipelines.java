package net.burningtnt.livehelper.render;

import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.shaders.UniformType;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.burningtnt.livehelper.LiveHelper;
import net.minecraft.resources.Identifier;

public class LiveHelperRenderPipelines {
    
    public static final RenderPipeline MIX = RenderPipeline.builder()
            .withLocation(Identifier.fromNamespaceAndPath(LiveHelper.MODID,"mix"))
            .withVertexShader(Identifier.fromNamespaceAndPath(LiveHelper.MODID,"core/blit"))
            .withFragmentShader(Identifier.fromNamespaceAndPath(LiveHelper.MODID,"core/mix"))
            .withVertexFormat(DefaultVertexFormat.POSITION_TEX, VertexFormat.Mode.QUADS)
            .withSampler("input0")
            .withSampler("input1")
            .withUniform("Projection", UniformType.UNIFORM_BUFFER)
            .withUniform("DynamicTransforms", UniformType.UNIFORM_BUFFER)
            .build();
            
}
