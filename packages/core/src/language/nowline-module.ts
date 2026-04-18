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
import {
    NowlineGeneratedSharedModule,
    NowlineGeneratedModule,
} from '../generated/module.js';
import type { NowlineTerminalNames, NowlineKeywordNames, NowlineAstType } from '../generated/ast.js';
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

export type NowlineAddedServices = {
    validation: {
        NowlineValidator: NowlineValidator;
    };
};

export type NowlineServices = LangiumCoreServices & NowlineAddedServices;

export type { NowlineAstType };

export const NowlineModule: Module<NowlineServices, PartialLangiumCoreServices & NowlineAddedServices> = {
    parser: {
        TokenBuilder: () =>
            new IndentationAwareTokenBuilder<NowlineTerminalNames, NowlineKeywordNames>({
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

export function createNowlineServices(context: {
    shared?: LangiumSharedCoreServices;
} = {}): {
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
