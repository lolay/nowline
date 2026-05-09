import type {
    Module,
    LangiumCoreServices,
    LangiumSharedCoreServices,
    PartialLangiumCoreServices,
    CstNode,
    GrammarAST,
    ValueType,
} from 'langium';
import {
    createDefaultCoreModule,
    createDefaultSharedCoreModule,
    DefaultValueConverter,
    EmptyFileSystem,
    inject,
    IndentationAwareTokenBuilder,
    IndentationAwareLexer,
} from 'langium';
import { NowlineGeneratedSharedModule, NowlineGeneratedModule } from '../generated/module.js';
import type {
    NowlineTerminalNames,
    NowlineKeywordNames,
    NowlineAstType,
} from '../generated/ast.js';
import { NowlineValidator, registerValidationChecks } from './nowline-validator.js';

// Strip trailing ':' from property key tokens so AST nodes carry clean keys
// (e.g. `duration` instead of `duration:`). The grammar uses a single key-with-colon
// terminal to resolve lexer ambiguity between bare keywords like `duration` and
// property keys like `duration:`; this converter keeps that token-level workaround
// out of the AST surface.
class NowlinePropertyKeyValueConverter extends DefaultValueConverter {
    protected override runConverter(
        rule: GrammarAST.AbstractRule,
        input: string,
        cstNode: CstNode,
    ): ValueType {
        if (rule.name === 'PROPERTY_KEY_WITH_COLON' || rule.name === 'INCLUDE_OPTION_KEY') {
            return input.endsWith(':') ? input.slice(0, -1) : input;
        }
        return super.runConverter(rule, input, cstNode);
    }
}

// Override `isStartOfLine` so that a position immediately following a
// `\`-line-continuation (handled by the LINE_CONTINUATION hidden terminal) is
// NOT treated as the start of a new logical line. Without this, a continuation
// line with zero leading whitespace would trigger a spurious DEDENT because the
// base implementation only inspects the single character at `text[offset - 1]`.
class NowlineIndentationAwareTokenBuilder extends IndentationAwareTokenBuilder<
    NowlineTerminalNames,
    NowlineKeywordNames
> {
    protected override isStartOfLine(text: string, offset: number): boolean {
        if (!super.isStartOfLine(text, offset)) {
            return false;
        }
        let i = offset - 1;
        while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
        while (i >= 0 && (text[i] === '\r' || text[i] === '\n')) i--;
        while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
        return i < 0 || text[i] !== '\\';
    }
}

export type NowlineAddedServices = {
    validation: {
        NowlineValidator: NowlineValidator;
    };
};

export type NowlineServices = LangiumCoreServices & NowlineAddedServices;

export type { NowlineAstType };

export const NowlineModule: Module<
    NowlineServices,
    PartialLangiumCoreServices & NowlineAddedServices
> = {
    parser: {
        TokenBuilder: () =>
            new NowlineIndentationAwareTokenBuilder({
                indentTokenName: 'INDENT',
                dedentTokenName: 'DEDENT',
                whitespaceTokenName: 'WS',
                ignoreIndentationDelimiters: [['[', ']']],
            }),
        Lexer: (services) => new IndentationAwareLexer(services),
        ParserConfig: () => ({
            maxLookahead: 4,
        }),
        ValueConverter: () => new NowlinePropertyKeyValueConverter(),
    },
    validation: {
        NowlineValidator: () => new NowlineValidator(),
    },
};

export function createNowlineServices(context: { shared?: LangiumSharedCoreServices } = {}): {
    shared: LangiumSharedCoreServices;
    Nowline: NowlineServices;
} {
    const shared =
        context.shared ??
        inject(createDefaultSharedCoreModule(EmptyFileSystem), NowlineGeneratedSharedModule);
    const Nowline = inject(
        createDefaultCoreModule({ shared }),
        NowlineGeneratedModule,
        NowlineModule,
    );
    shared.ServiceRegistry.register(Nowline);
    registerValidationChecks(Nowline);
    return { shared, Nowline };
}
